import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { Graph } from '@liquid-bricks/lib-nats-graph/graph'
import { diagnostics as makeDiagnostics } from '@liquid-bricks/lib-diagnostics'
import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { ulid } from 'ulid'

import { createComponentServiceRouter } from '../../../../../router.js'
import { dataMapper as createDataMapper, domain } from '@liquid-bricks/spec-domain/domain'
import { findDependencyFreeStates } from '../../../../../componentInstance/cmd/start/findDependencyFreeStates.js'
import { publishEvents as publishStartInstanceEvents }
  from '../../../../../componentInstance/cmd/start/publishEvents/index.js'
import { doesInstanceExist } from '../../../../../componentInstance/cmd/start/doesInstanceExist.js'
import { getStateMachine } from '../../../../../componentInstance/cmd/start/getStateMachine.js'
import { usesImportInstances } from '../../../../../componentInstance/cmd/start/loadData/usesImportInstances.js'
import { usesGateInstances } from '../../../../../componentInstance/cmd/start/loadData/usesGateInstances.js'
import { componentImports } from '../../../../../componentInstance/cmd/create/loadData/componentImports.js'
import { componentGates } from '../../../../../componentInstance/cmd/create/loadData/componentGates.js'
import { handler as startGateHandler } from '../../../../../gate/cmd/start/handler.js'
import { serviceConfiguration } from '../../../../provider/serviceConfiguration/dotenv/index.js'
import { runHandler } from '../../../../util/runHandler.js'

const { NATS_IP_ADDRESS } = serviceConfiguration()
assert.ok(NATS_IP_ADDRESS, 'NATS_IP_ADDRESS missing; set in .env or .env.local')

const noop = () => { }
function makeDiagnosticsInstance() {
  return makeDiagnostics({
    logger: { info: noop, warn: noop, error: noop, debug: noop },
    metrics: { timing: noop, count: noop },
    sample: () => true,
    rateLimit: () => true,
  })
}

function createGraphContext() {
  const diagnostics = makeDiagnosticsInstance()
  const graph = Graph({
    kv: 'nats',
    kvConfig: { servers: NATS_IP_ADDRESS, bucket: `component-instance-start-${ulid()}` },
    diagnostics,
  })
  const g = graph.g
  const dataMapper = createDataMapper({ g, diagnostics })
  return { graph, diagnostics, g, dataMapper }
}

async function withGraphContext(run) {
  const ctx = createGraphContext()
  try {
    await run(ctx)
  } finally {
    try { await ctx.graph?.close?.() } catch { }
  }
}

const registerSpec = getRegisterSpec()
const createInstanceSpec = getCreateInstanceSpec()
const startInstanceSpec = getStartInstanceSpec()

function createHandlerDiagnostics(diagnostics, scope = {}, message) {
  return diagnostics.child
    ? diagnostics.child({ router: { stage: 'unit-test' }, scope, message })
    : diagnostics
}

function getRegisterSpec() {
  const router = createComponentServiceRouter({
    natsContext: {},
    g: {},
    diagnostics: makeDiagnosticsInstance(),
    dataMapper: {},
  })
  const route = router.routes.find(({ values }) =>
    values.channel === 'cmd'
    && values.entity === 'component'
    && values.action === 'register'
  )
  assert.ok(route, 'register route not found')
  return route.config
}

function getCreateInstanceSpec() {
  const router = createComponentServiceRouter({
    natsContext: {},
    g: {},
    diagnostics: makeDiagnosticsInstance(),
    dataMapper: {},
  })
  const route = router.routes.find(({ values }) =>
    values.channel === 'cmd'
    && values.entity === 'componentInstance'
    && values.action === 'create'
  )
  assert.ok(route, 'create route not found')
  return route.config
}

function getStartInstanceSpec() {
  const router = createComponentServiceRouter({
    natsContext: {},
    g: {},
    diagnostics: makeDiagnosticsInstance(),
    dataMapper: {},
  })
  const route = router.routes.find(({ values }) =>
    values.channel === 'cmd'
    && values.entity === 'componentInstance'
    && values.action === 'start'
  )
  assert.ok(route, 'start route not found')
  return route.config
}

async function registerComponent(component, ctx) {
  const handlerDiagnostics = createHandlerDiagnostics(ctx.diagnostics, { component })
  await runHandler(registerSpec.handler, { rootCtx: ctx, scope: { handlerDiagnostics, component } })
}

async function createInstance(ctx, scope) {
  const handlerDiagnostics = createHandlerDiagnostics(ctx.diagnostics, scope)
  return createInstanceSpec.handler({ rootCtx: ctx, scope: { ...scope, handlerDiagnostics } })
}

async function startInstance(ctx, scope) {
  const handlerDiagnostics = createHandlerDiagnostics(ctx.diagnostics, scope)
  return startInstanceSpec.handler({ rootCtx: ctx, scope: { ...scope, handlerDiagnostics } })
}

async function loadImports({ g, componentId }) {
  const { imports = [] } = await componentImports({ rootCtx: { g }, scope: { componentId } })
  return imports
}

async function loadGates({ g, componentId }) {
  const { gates = [] } = await componentGates({ rootCtx: { g }, scope: { componentId } })
  return gates
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

function pickFirst(values) {
  if (Array.isArray(values)) return values[0]
  return values ?? null
}

async function getStateMachineIdForInstance({ g, instanceId }) {
  const [instanceVertexId] = await g
    .V()
    .has('label', domain.vertex.componentInstance.constants.LABEL)
    .has('instanceId', instanceId)
    .id()
  assert.ok(instanceVertexId, `componentInstance ${instanceId} missing`)

  const [stateMachineId] = await g
    .V(instanceVertexId)
    .out(domain.edge.has_stateMachine.componentInstance_stateMachine.constants.LABEL)
    .id()
  return { stateMachineId, instanceVertexId }
}

async function namesForStateEdges(g, edgeIds) {
  const names = []
  for (const edgeId of edgeIds ?? []) {
    const [row] = await g.E(edgeId).inV().valueMap('name')
    names.push(pickFirst(row?.name ?? row))
  }
  return names
}

test('handler marks stateMachine running and updates timestamp', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('StartRunningComponent').toJSON()

    await registerComponent(component, { diagnostics, dataMapper, g })

    const instanceId = 'instance-start-running'
    const componentId = await getComponentId({ g, diagnostics, componentHash: component.hash })
    const imports = await loadImports({ g, componentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: component.hash, componentId, instanceId, imports })

    const { stateMachineId } = await getStateMachineIdForInstance({ g, instanceId })
    const [initialState] = await g.V(stateMachineId).valueMap('state', 'updatedAt')
    const initialUpdatedAt = pickFirst(initialState.updatedAt)
    assert.equal(pickFirst(initialState.state), domain.vertex.stateMachine.constants.STATES.CREATED)

    await startInstance({ diagnostics, g }, { stateMachineId })

    const [stateRow] = await g.V(stateMachineId).valueMap('state', 'updatedAt')
    assert.equal(pickFirst(stateRow.state), domain.vertex.stateMachine.constants.STATES.RUNNING)
    assert.notEqual(pickFirst(stateRow.updatedAt), initialUpdatedAt)
  })
})

test('findDependencyFreeStates returns only nodes without dependencies', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('DependencyFreeComponent')
      .task('taskIndependent', {})
      .data('inputData', { deps: () => { } })
      .task('taskWithDep', { deps: ({ data }) => data.inputData })
      .data('derivedData', { deps: ({ task }) => task.taskWithDep })
      .toJSON()

    await registerComponent(component, { diagnostics, dataMapper, g })

    const instanceId = 'instance-dependency-free'
    const componentId = await getComponentId({ g, diagnostics, componentHash: component.hash })
    const imports = await loadImports({ g, componentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: component.hash, componentId, instanceId, imports })

    const { stateMachineId } = await getStateMachineIdForInstance({ g, instanceId })
    const { dataStateIds, taskStateIds } = await findDependencyFreeStates({ rootCtx: { g }, scope: { stateMachineId } })

    const dataNames = await namesForStateEdges(g, dataStateIds)
    const taskNames = await namesForStateEdges(g, taskStateIds)

    assert.deepEqual(dataNames.sort(), ['inputData'])
    assert.deepEqual(taskNames.sort(), ['taskIndependent'])
  })
})

test('doesInstanceExist validates presence and usesImportInstances returns import ids', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const sharedComponent = componentBuilder('ImportShared').toJSON()
    const component = componentBuilder('ImportParent')
      .import('shared', { hash: sharedComponent.hash })
      .toJSON()

    await registerComponent(sharedComponent, { diagnostics, dataMapper, g })
    await registerComponent(component, { diagnostics, dataMapper, g })

    const instanceId = 'instance-with-import'
    const componentId = await getComponentId({ g, diagnostics, componentHash: component.hash })
    const imports = await loadImports({ g, componentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: component.hash, componentId, instanceId, imports })

    const [instanceVertexId] = await g
      .V()
      .has('label', domain.vertex.componentInstance.constants.LABEL)
      .has('instanceId', instanceId)
      .id()
    assert.ok(instanceVertexId, 'componentInstance vertex missing')

    const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { instanceId })
    const exists = await doesInstanceExist({ rootCtx: { diagnostics, g }, scope: { handlerDiagnostics, instanceId } })
    assert.equal(exists.instanceVertexId, instanceVertexId)

    const { stateMachineId } = await getStateMachine({ rootCtx: { g }, scope: { instanceVertexId } })
    assert.ok(stateMachineId, 'stateMachine missing')

    await assert.rejects(
      doesInstanceExist({
        rootCtx: { diagnostics, g },
        scope: { handlerDiagnostics: createHandlerDiagnostics(diagnostics, { instanceId: 'missing-instance' }), instanceId: 'missing-instance' }
      }),
      diagnostics.DiagnosticError,
    )

    const importsHook = await usesImportInstances({ rootCtx: { g }, scope: { instanceVertexId } })
    assert.equal(importsHook.usesImportInstances.length, 1)

    const [importInstanceRefId] = await g
      .V(instanceVertexId)
      .out(domain.edge.uses_import.componentInstance_importInstanceRef.constants.LABEL)
      .id()
    const [importedInstanceRow] = await g
      .V(importInstanceRefId)
      .out(domain.edge.uses_import.importInstanceRef_componentInstance.constants.LABEL)
      .valueMap('instanceId')
    const importedInstanceId = pickFirst(importedInstanceRow.instanceId)

    const importInstanceIds = importsHook.usesImportInstances.map(({ instanceId }) => instanceId)
    assert.deepEqual(importInstanceIds, [importedInstanceId])
  })
})

test('publishEvents starts dependency-free states, imports, and emits started', async () => {
  const instanceId = 'publish-events-instance'
  const dataStateIds = ['data-state-1', 'data-state-2']
  const taskStateIds = ['task-state-1']
  const importInstances = [
    { instanceId: 'import-1' },
    { instanceId: 'import-1' },
    { instanceId: 'import-2' },
  ]
  const published = []
  const natsContext = { publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }) }

  await publishStartInstanceEvents({
    rootCtx: { natsContext },
    scope: { instanceId, dataStateIds, taskStateIds, usesImportInstances: importInstances },
  })

  const startDataSubject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('data')
    .channel('cmd')
    .action('start')
    .version('v1')
    .build()
  const startTaskSubject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('task')
    .channel('cmd')
    .action('start')
    .version('v1')
    .build()
  const startImportSubject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('import')
    .channel('cmd')
    .action('start')
    .version('v1')
    .build()
  const startedSubject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('componentInstance')
    .channel('evt')
    .action('started')
    .version('v1')
    .build()

  const startDataEvents = published.filter(({ subject }) => subject === startDataSubject)
  assert.equal(startDataEvents.length, dataStateIds.length)
  assert.deepEqual(
    startDataEvents.map(({ payload }) => payload.data.stateId).sort(),
    dataStateIds.sort(),
  )
  assert.ok(startDataEvents.every(({ payload }) => payload.data.instanceId === instanceId))

  const startTaskEvents = published.filter(({ subject }) => subject === startTaskSubject)
  assert.equal(startTaskEvents.length, taskStateIds.length)
  assert.deepEqual(startTaskEvents.map(({ payload }) => payload.data.stateId), taskStateIds)
  assert.ok(startTaskEvents.every(({ payload }) => payload.data.instanceId === instanceId))

  const startImportEvents = published.filter(({ subject }) => subject === startImportSubject)
  assert.equal(startImportEvents.length, 2)
  assert.deepEqual(
    startImportEvents.map(({ payload }) => payload.data.instanceId).sort(),
    ['import-1', 'import-2'],
  )
  assert.ok(startImportEvents.every(({ payload }) => payload.data.parentInstanceId === instanceId))

  const startedEvents = published.filter(({ subject }) => subject === startedSubject)
  assert.equal(startedEvents.length, 1)
  assert.deepEqual(startedEvents[0].payload.data, { instanceId })
})

test('publishEvents dispatches gate start command and gate handler emits compute_result', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const gatedComponent = componentBuilder('StartGateTarget')
      .data('ready', { deps: () => { } })
      .toJSON()
    const rootComponent = componentBuilder('StartGateRoot')
      .gate('setup', { hash: gatedComponent.hash, fnc: () => true })
      .toJSON()

    await registerComponent(gatedComponent, { diagnostics, dataMapper, g })
    await registerComponent(rootComponent, { diagnostics, dataMapper, g })

    const instanceId = 'instance-start-gate-compute'
    const componentId = await getComponentId({ g, diagnostics, componentHash: rootComponent.hash })
    const imports = await loadImports({ g, componentId })
    const gates = await loadGates({ g, componentId })
    await createInstance(
      { diagnostics, dataMapper, g },
      { componentHash: rootComponent.hash, componentId, instanceId, imports, gates },
    )

    const [instanceVertexId] = await g
      .V()
      .has('label', domain.vertex.componentInstance.constants.LABEL)
      .has('instanceId', instanceId)
      .id()
    assert.ok(instanceVertexId, 'root instance vertex missing')

    const { usesGateInstances: gateInstances } = await usesGateInstances({ rootCtx: { g }, scope: { instanceVertexId } })
    assert.equal(gateInstances.length, 1)

    const published = []
    const natsContext = { publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }) }

    await publishStartInstanceEvents({
      rootCtx: { natsContext, g },
      scope: {
        instanceId,
        instanceVertexId,
        dataStateIds: [],
        taskStateIds: [],
        usesImportInstances: [],
        usesGateInstances: gateInstances,
      },
    })

    const gateStartSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('gate')
      .channel('cmd')
      .action('start')
      .version('v1')
      .build()
    const gateExecSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('component')
      .channel('exec')
      .action('compute_result')
      .version('v1')
      .build()
    const startInstanceSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('componentInstance')
      .channel('cmd')
      .action('start')
      .version('v1')
      .build()

    const gateStartEvents = published.filter(({ subject }) => subject === gateStartSubject)
    assert.equal(gateStartEvents.length, 1)
    assert.deepEqual(gateStartEvents[0].payload.data, {
      instanceId: gateInstances[0].instanceId,
      parentInstanceId: instanceId,
    })

    const directComputeEvents = published.filter(({ subject }) => subject === gateExecSubject)
    assert.equal(directComputeEvents.length, 0, 'gate compute_result should be emitted by gate.cmd.start handler')

    const directStartEvents = published.filter(({ subject }) => subject === startInstanceSubject)
    assert.equal(directStartEvents.length, 0, 'gated instance should not be started directly by consumer')

    const gatePublishes = []
    await startGateHandler({
      rootCtx: {
        natsContext: { publish: async (subject, payload) => gatePublishes.push({ subject, payload: JSON.parse(payload) }) },
        g,
      },
      scope: gateStartEvents[0].payload.data,
    })

    const gateComputeEvents = gatePublishes.filter(({ subject }) => subject === gateExecSubject)
    assert.equal(gateComputeEvents.length, 1)
    assert.deepEqual(gateComputeEvents[0].payload.data, {
      instanceId,
      componentHash: rootComponent.hash,
      name: 'setup',
      type: 'gate',
      deps: {},
    })

    const gateDirectStartEvents = gatePublishes.filter(({ subject }) => subject === startInstanceSubject)
    assert.equal(gateDirectStartEvents.length, 0, 'gate handler should not start gated instance directly')
  })
})
