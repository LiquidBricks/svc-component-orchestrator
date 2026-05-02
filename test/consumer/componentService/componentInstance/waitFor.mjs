import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { Graph } from '@liquid-bricks/lib-nats-graph/graph'
import { diagnostics as makeDiagnostics } from '@liquid-bricks/lib-diagnostics'
import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { dataMapper as createDataMapper, domain } from '@liquid-bricks/spec-domain/domain'

import { path as registerPath } from '../../../../core/component/cmd/register/index.js'
import { handler as createInstanceHandler } from '../../../../core/componentInstance/cmd/create/handler/index.js'
import { componentImports } from '../../../../core/componentInstance/cmd/create/loadData/componentImports.js'
import { findDependencyFreeStates } from '../../../../core/componentInstance/cmd/start/findDependencyFreeStates.js'
import { handler as startDependantsHandler } from '../../../../core/componentInstance/cmd/start_dependants/handler.js'
import { publishStartCommands } from '../../../../core/componentInstance/cmd/start_dependants/publishEvents/publishStartCommands.js'
import { usesImportInstances } from '../../../../core/componentInstance/cmd/start/loadData/usesImportInstances.js'
import { startImports } from '../../../../core/componentInstance/cmd/start/publishEvents/startImports.js'
import { handler as startImportHandler } from '../../../../core/import/cmd/start/handler.js'
import { invokeRoute } from '../../../util/invokeRoute.js'

const noop = console.log
function makeDiagnosticsInstance() {
  return makeDiagnostics({
    logger: { info: noop, warn: noop, error: noop, debug: noop },
    metrics: { timing: noop, count: noop },
    sample: () => true,
    rateLimit: () => true,
  })
}

function createHandlerDiagnostics(diagnostics, scope = {}) {
  return diagnostics.child
    ? diagnostics.child({ router: { stage: 'unit-test' }, scope })
    : diagnostics
}

function createMemoryContext() {
  const diagnostics = makeDiagnosticsInstance()
  const graph = Graph({ kv: 'memory', diagnostics })
  const g = graph.g
  const dataMapper = createDataMapper({ g, diagnostics })
  return { diagnostics, graph, g, dataMapper }
}

async function getComponentId({ g, diagnostics, componentHash }) {
  const [componentId] = await g
    .V()
    .has('label', domain.vertex.component.constants.LABEL)
    .has('hash', componentHash)
    .id()
  diagnostics.require(
    componentId,
    diagnostics.DiagnosticError,
    `component not found for componentHash ${componentHash}`,
  )
  return componentId
}

async function getInstanceContext({ g, diagnostics, instanceId }) {
  const [instanceVertexId] = await g
    .V()
    .has('label', domain.vertex.componentInstance.constants.LABEL)
    .has('instanceId', instanceId)
    .id()
  diagnostics.require(
    instanceVertexId,
    diagnostics.DiagnosticError,
    `componentInstance ${instanceId} not found`,
  )

  const [stateMachineId] = await g
    .V(instanceVertexId)
    .out(domain.edge.has_stateMachine.componentInstance_stateMachine.constants.LABEL)
    .id()

  return { instanceVertexId, stateMachineId }
}

async function getStateEdgeIdByName({ g, stateMachineId, edgeLabel, nodeName }) {
  const [edgeId] = await g
    .V(stateMachineId)
    .outE(edgeLabel)
    .filter(_ => _.inV().has('name', nodeName))
    .id()
  return edgeId
}

async function edgeNames({ g, edgeIds }) {
  const names = []
  for (const edgeId of edgeIds ?? []) {
    const [row] = await g.E(edgeId).inV().valueMap('name')
    const value = row?.name ?? row
    names.push(Array.isArray(value) ? value[0] : value)
  }
  return names
}

function findImportByAlias(imports, alias) {
  return imports.find(item => item.alias === alias)
}

test('task waitFor behaves like a dependency', async () => {
  const ctx = createMemoryContext()
  try {
    const handlerDiagnostics = createHandlerDiagnostics(ctx.diagnostics)
    const component = componentBuilder('WaitForTasks')
      .task('first', {})
      .task('second', { waitFor: ({ task }) => task.first })
      .toJSON()

    await invokeRoute(ctx, { path: registerPath, data: component })
    const componentId = await getComponentId({ g: ctx.g, diagnostics: ctx.diagnostics, componentHash: component.hash })
    const { imports } = await componentImports({ rootCtx: { g: ctx.g }, scope: { componentId } })

    const instanceId = 'instance-wait-for-task'
    await createInstanceHandler({
      rootCtx: ctx,
      scope: { handlerDiagnostics, componentHash: component.hash, componentId, instanceId, imports },
    })

    const { instanceVertexId, stateMachineId } = await getInstanceContext({ g: ctx.g, diagnostics: ctx.diagnostics, instanceId })
    const { taskStateIds } = await findDependencyFreeStates({ rootCtx: { g: ctx.g }, scope: { stateMachineId } })
    const readyTaskNames = await edgeNames({ g: ctx.g, edgeIds: taskStateIds })
    assert.deepEqual(readyTaskNames, ['first'])

    const firstEdgeId = await getStateEdgeIdByName({
      g: ctx.g,
      stateMachineId,
      edgeLabel: domain.edge.has_task_state.stateMachine_task.constants.LABEL,
      nodeName: 'first',
    })
    const [providedNodeId] = await ctx.g.E(firstEdgeId).inV().id()
    await ctx.g
      .E(firstEdgeId)
      .property('status', domain.edge.has_task_state.stateMachine_task.constants.Status.PROVIDED)
      .property('result', '"done"')

    const { starters } = await startDependantsHandler({
      rootCtx: { g: ctx.g },
      scope: { instanceId, instanceVertexId, stateMachineId, providedNodeId, type: 'task' },
    })
    const readyAfterNames = await edgeNames({ g: ctx.g, edgeIds: starters[0].taskStateIds })
    assert.deepEqual(readyAfterNames, ['second'])
  } finally {
    try { await ctx.graph?.close?.() } catch { }
  }
})

test('import waitFor can reference another import lifecycle.done', async () => {
  const ctx = createMemoryContext()
  try {
    const handlerDiagnostics = createHandlerDiagnostics(ctx.diagnostics)
    const controlPlaneComponent = componentBuilder('WaitForLifecycleControlPlane')
      .task('configure', {})
      .toJSON()
    const corednsComponent = componentBuilder('WaitForLifecycleCoreDns')
      .task('start', {})
      .toJSON()
    const rootComponent = componentBuilder('WaitForLifecycleRoot')
      .import('controlplanepod', { hash: controlPlaneComponent.hash })
      .import('corednsStart', {
        hash: corednsComponent.hash,
        waitFor: _ => [_.controlplanepod.lifecycle.done],
      })
      .toJSON()

    await invokeRoute(ctx, { path: registerPath, data: controlPlaneComponent })
    await invokeRoute(ctx, { path: registerPath, data: corednsComponent })
    await invokeRoute(ctx, { path: registerPath, data: rootComponent })

    const componentId = await getComponentId({ g: ctx.g, diagnostics: ctx.diagnostics, componentHash: rootComponent.hash })
    const { imports } = await componentImports({ rootCtx: { g: ctx.g }, scope: { componentId } })

    const instanceId = 'instance-wait-for-lifecycle-registration'
    await createInstanceHandler({
      rootCtx: ctx,
      scope: { handlerDiagnostics, componentHash: rootComponent.hash, componentId, instanceId, imports },
    })

    const { instanceVertexId } = await getInstanceContext({ g: ctx.g, diagnostics: ctx.diagnostics, instanceId })
    const { usesImportInstances: importInstances } = await usesImportInstances({
      rootCtx: { g: ctx.g },
      scope: { instanceVertexId },
    })

    const corednsImport = findImportByAlias(importInstances, 'corednsStart')
    assert.ok(corednsImport, 'corednsStart import instance missing')
    assert.equal(corednsImport.waitFor.length, 1, 'corednsStart should wait for controlplanepod lifecycle.done')
  } finally {
    try { await ctx.graph?.close?.() } catch { }
  }
})

test('import waitFor lifecycle.done starts dependent import after referenced import completes', async () => {
  const ctx = createMemoryContext()
  try {
    const handlerDiagnostics = createHandlerDiagnostics(ctx.diagnostics)
    const controlPlaneComponent = componentBuilder('WaitForLifecycleCompletionControlPlane')
      .task('configure', {})
      .toJSON()
    const corednsComponent = componentBuilder('WaitForLifecycleCompletionCoreDns')
      .task('start', {})
      .toJSON()
    const rootComponent = componentBuilder('WaitForLifecycleCompletionRoot')
      .import('controlplanepod', { hash: controlPlaneComponent.hash })
      .import('corednsStart', {
        hash: corednsComponent.hash,
        waitFor: _ => [_.controlplanepod.lifecycle.done],
      })
      .toJSON()

    await invokeRoute(ctx, { path: registerPath, data: controlPlaneComponent })
    await invokeRoute(ctx, { path: registerPath, data: corednsComponent })
    await invokeRoute(ctx, { path: registerPath, data: rootComponent })

    const componentId = await getComponentId({ g: ctx.g, diagnostics: ctx.diagnostics, componentHash: rootComponent.hash })
    const { imports } = await componentImports({ rootCtx: { g: ctx.g }, scope: { componentId } })

    const rootInstanceId = 'instance-wait-for-lifecycle-completion'
    await createInstanceHandler({
      rootCtx: ctx,
      scope: { handlerDiagnostics, componentHash: rootComponent.hash, componentId, instanceId: rootInstanceId, imports },
    })

    const { instanceVertexId: rootInstanceVertexId } = await getInstanceContext({
      g: ctx.g,
      diagnostics: ctx.diagnostics,
      instanceId: rootInstanceId,
    })
    const { usesImportInstances: importInstances } = await usesImportInstances({
      rootCtx: { g: ctx.g },
      scope: { instanceVertexId: rootInstanceVertexId },
    })
    const controlPlaneImport = findImportByAlias(importInstances, 'controlplanepod')
    const corednsImport = findImportByAlias(importInstances, 'corednsStart')
    assert.ok(controlPlaneImport, 'controlplanepod import instance missing')
    assert.ok(corednsImport, 'corednsStart import instance missing')

    const startComponentInstanceSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('componentInstance')
      .channel('cmd')
      .action('start')
      .version('v1')
      .build()

    const blockedPublishes = []
    await startImportHandler({
      rootCtx: {
        g: ctx.g,
        natsContext: { publish: async (subject, payload) => blockedPublishes.push({ subject, payload: JSON.parse(payload) }) },
      },
      scope: { instanceId: corednsImport.instanceId, parentInstanceId: rootInstanceId },
    })
    assert.equal(
      blockedPublishes.filter(({ subject }) => subject === startComponentInstanceSubject).length,
      0,
      'corednsStart should not start before controlplanepod lifecycle.done',
    )

    const { stateMachineId: controlPlaneStateMachineId } = await getInstanceContext({
      g: ctx.g,
      diagnostics: ctx.diagnostics,
      instanceId: controlPlaneImport.instanceId,
    })
    const configureEdgeId = await getStateEdgeIdByName({
      g: ctx.g,
      stateMachineId: controlPlaneStateMachineId,
      edgeLabel: domain.edge.has_task_state.stateMachine_task.constants.LABEL,
      nodeName: 'configure',
    })
    await ctx.g
      .E(configureEdgeId)
      .property('status', domain.edge.has_task_state.stateMachine_task.constants.Status.PROVIDED)
      .property('result', JSON.stringify({ configured: true }))
    await ctx.g
      .V(controlPlaneStateMachineId)
      .property('state', domain.vertex.stateMachine.constants.STATES.COMPLETE)

    const readyPublishes = []
    await startImportHandler({
      rootCtx: {
        g: ctx.g,
        natsContext: { publish: async (subject, payload) => readyPublishes.push({ subject, payload: JSON.parse(payload) }) },
      },
      scope: { instanceId: corednsImport.instanceId, parentInstanceId: rootInstanceId },
    })
    assert.ok(readyPublishes.some(({ subject, payload }) =>
      subject === startComponentInstanceSubject
      && payload.data.instanceId === corednsImport.instanceId
    ))
  } finally {
    try { await ctx.graph?.close?.() } catch { }
  }
})

test('import waitFor prevents starting child until dependency provided', async () => {
  const ctx = createMemoryContext()
  try {
    const handlerDiagnostics = createHandlerDiagnostics(ctx.diagnostics)
    const childComponent = componentBuilder('WaitForChild')
      .data('child', { deps: () => { } })
      .toJSON()
    const parentComponent = componentBuilder('WaitForParent')
      .import('child', { hash: childComponent.hash, waitFor: ({ data }) => data.gate })
      .data('gate', { deps: () => { } })
      .toJSON()

    await invokeRoute(ctx, { path: registerPath, data: childComponent })
    await invokeRoute(ctx, { path: registerPath, data: parentComponent })

    const componentId = await getComponentId({ g: ctx.g, diagnostics: ctx.diagnostics, componentHash: parentComponent.hash })
    const { imports } = await componentImports({ rootCtx: { g: ctx.g }, scope: { componentId } })

    const instanceId = 'instance-wait-for-import'
    const createResult = await createInstanceHandler({
      rootCtx: ctx,
      scope: { handlerDiagnostics, componentHash: parentComponent.hash, componentId, instanceId, imports },
    })
    const childInstanceId = createResult.importedInstances?.[0]?.instanceId
    assert.ok(childInstanceId, 'child instance missing')

    const { instanceVertexId, stateMachineId } = await getInstanceContext({ g: ctx.g, diagnostics: ctx.diagnostics, instanceId })
    const { usesImportInstances: importInstances } = await usesImportInstances({
      rootCtx: { g: ctx.g },
      scope: { instanceVertexId },
    })
    assert.ok(importInstances.length > 0, 'expected an import instance')
    assert.equal(importInstances[0]?.waitFor?.length, 1)

    const initialPublishes = []
    const natsContext = { publish: async (subject, payload) => initialPublishes.push({ subject, payload: JSON.parse(payload) }) }
    const startImportSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('import')
      .channel('cmd')
      .action('start')
      .version('v1')
      .build()
    const startComponentInstanceSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('componentInstance')
      .channel('cmd')
      .action('start')
      .version('v1')
      .build()
    await startImports({
      rootCtx: { natsContext },
      scope: { instanceId, instanceVertexId, usesImportInstances: importInstances },
    })
    assert.equal(initialPublishes.length, 1)
    assert.equal(initialPublishes[0].subject, startImportSubject)
    assert.equal(initialPublishes[0].payload?.data?.instanceId, childInstanceId)
    assert.equal(initialPublishes[0].payload?.data?.parentInstanceId, instanceId)

    const preGateImportStartPublishes = []
    const preGateImportStartContext = {
      publish: async (subject, payload) => preGateImportStartPublishes.push({ subject, payload: JSON.parse(payload) }),
    }
    await startImportHandler({
      rootCtx: { natsContext: preGateImportStartContext, g: ctx.g },
      scope: initialPublishes[0].payload.data,
    })
    assert.equal(preGateImportStartPublishes.filter(({ subject }) => subject === startComponentInstanceSubject).length, 0)

    const gateEdgeId = await getStateEdgeIdByName({
      g: ctx.g,
      stateMachineId,
      edgeLabel: domain.edge.has_data_state.stateMachine_data.constants.LABEL,
      nodeName: 'gate',
    })
    const [gateNodeId] = await ctx.g.E(gateEdgeId).inV().id()
    await ctx.g
      .E(gateEdgeId)
      .property('status', domain.edge.has_data_state.stateMachine_data.constants.Status.PROVIDED)

    const dependants = await startDependantsHandler({
      rootCtx: { g: ctx.g },
      scope: { instanceId, instanceVertexId, stateMachineId, providedNodeId: gateNodeId, type: 'data' },
    })

    assert.ok(dependants.starters[0].importInstanceIds.includes(childInstanceId))

    const published = []
    const startContext = { publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }) }
    await publishStartCommands({
      rootCtx: { natsContext: startContext },
      scope: dependants,
    })
    assert.ok(published.some(({ subject, payload }) =>
      subject === startImportSubject
      && payload.data.instanceId === childInstanceId
      && payload.data.parentInstanceId === instanceId
    ))

    const postGateImportStartPublishes = []
    const postGateImportStartContext = {
      publish: async (subject, payload) => postGateImportStartPublishes.push({ subject, payload: JSON.parse(payload) }),
    }
    for (const importStartCommand of published.filter(({ subject }) => subject === startImportSubject)) {
      await startImportHandler({
        rootCtx: { natsContext: postGateImportStartContext, g: ctx.g },
        scope: importStartCommand.payload.data,
      })
    }
    assert.ok(postGateImportStartPublishes.some(({ subject, payload }) =>
      subject === startComponentInstanceSubject
      && payload.data.instanceId === childInstanceId
    ))
  } finally {
    try { await ctx.graph?.close?.() } catch { }
  }
})
