import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { Graph } from '@liquid-bricks/lib-nats-graph/graph'
import { diagnostics as makeDiagnostics } from '@liquid-bricks/lib-diagnostics'
import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { ulid } from 'ulid'

import { createComponentServiceRouter } from '../../../../../router.js'
import { path as registerPath } from '../../../../../core/component/cmd/register/index.js'
import { dataMapper as createDataMapper, domain } from '@liquid-bricks/spec-domain/domain'
import { publishEvents as publishCreateInstanceEvents } from '../../../../../core/componentInstance/cmd/create/publishEvents/index.js'
import { publishEvents as publishStartInstanceEvents } from '../../../../../core/componentInstance/cmd/start/publishEvents/index.js'
import { usesImportInstances } from '../../../../../core/componentInstance/cmd/start/loadData/usesImportInstances.js'
import { componentImports } from '../../../../../core/componentInstance/cmd/create/loadData/componentImports.js'
import { componentGates } from '../../../../../core/componentInstance/cmd/create/loadData/componentGates.js'
import { serviceConfiguration } from '../../../../provider/serviceConfiguration/dotenv/index.js'
import { invokeRoute } from '../../../../util/invokeRoute.js'

const { NATS_IP_ADDRESS } = serviceConfiguration()
assert.ok(NATS_IP_ADDRESS, 'NATS_IP_ADDRESS missing; set in .env or .env.local')

function makeDiagnosticsInstance() {
  return makeDiagnostics({
    logger: { info: () => { }, warn: () => { }, error: () => { }, debug: () => { } },
    metrics: { timing: () => { }, count: () => { } },
    sample: () => true,
    rateLimit: () => true,
  })
}

function createGraphContext() {
  const diagnostics = makeDiagnosticsInstance()
  const graph = Graph({
    kv: 'nats',
    kvConfig: { servers: NATS_IP_ADDRESS, bucket: `component-instance-create-${ulid()}` },
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

const createInstanceSpec = getCreateInstanceSpec()

function createHandlerDiagnostics(diagnostics, scope = {}, message) {
  return diagnostics.child
    ? diagnostics.child({ router: { stage: 'unit-test' }, scope, message })
    : diagnostics
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

async function registerComponent(component, ctx) {
  await invokeRoute(ctx, { path: registerPath, data: component })
}

async function createInstance(ctx, scope) {
  const handlerDiagnostics = createHandlerDiagnostics(ctx.diagnostics, scope)
  return createInstanceSpec.handler({ rootCtx: ctx, scope: { ...scope, handlerDiagnostics } })
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

test('handler creates componentInstance stateMachine and links data/task states', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('ComponentStateMachine')
      .task('taskA', {})
      .task('taskB', {})
      .data('dataA', { deps: () => { } })
      .toJSON()

    await registerComponent(component, { diagnostics, dataMapper, g })


    const [componentId] = await g
      .V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', component.hash)
      .id()
    const instanceId = 'instance-state-machine'
    const imports = await loadImports({ g, componentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: component.hash, componentId, instanceId, imports })

    const [instanceVertexId] = await g
      .V()
      .has('label', domain.vertex.componentInstance.constants.LABEL)
      .has('instanceId', instanceId)
      .id()
    assert.ok(instanceVertexId, 'componentInstance vertex missing')

    const instanceOfIds = await g
      .V(instanceVertexId)
      .out(domain.edge.instance_of.componentInstance_component.constants.LABEL)
      .id()
    assert.deepEqual(instanceOfIds, [componentId])

    const [stateMachineId] = await g
      .V(instanceVertexId)
      .out(domain.edge.has_stateMachine.componentInstance_stateMachine.constants.LABEL)
      .id()
    assert.ok(stateMachineId, 'stateMachine vertex missing')

    const componentDataIds = await g
      .V(componentId)
      .out(domain.edge.has_data.component_data.constants.LABEL)
      .id()
    const componentTaskIds = await g
      .V(componentId)
      .out(domain.edge.has_task.component_task.constants.LABEL)
      .id()

    const stateMachineDataIds = await g
      .V(stateMachineId)
      .out(domain.edge.has_data_state.stateMachine_data.constants.LABEL)
      .id()
    assert.deepEqual(stateMachineDataIds.sort(), componentDataIds.sort())

    const stateMachineTaskIds = await g
      .V(stateMachineId)
      .out(domain.edge.has_task_state.stateMachine_task.constants.LABEL)
      .id()
    assert.deepEqual(stateMachineTaskIds.sort(), componentTaskIds.sort())
  })
})

test('handler creates gate instances and links them to gate refs', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const targetComponent = componentBuilder('GateTarget')
      .data('ready', { deps: () => { } })
      .toJSON()
    const rootComponent = componentBuilder('GateRoot')
      .gate('setup', { hash: targetComponent.hash, fnc: () => true })
      .toJSON()

    await registerComponent(targetComponent, { diagnostics, dataMapper, g })
    await registerComponent(rootComponent, { diagnostics, dataMapper, g })

    const rootComponentId = await getComponentId({ g, diagnostics, componentHash: rootComponent.hash })
    const gates = await loadGates({ g, componentId: rootComponentId })

    const instanceId = 'instance-gate-root'
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: rootComponent.hash, componentId: rootComponentId, instanceId, imports: [], gates })

    const [rootInstanceVertexId] = await g
      .V()
      .has('label', domain.vertex.componentInstance.constants.LABEL)
      .has('instanceId', instanceId)
      .id()
    assert.ok(rootInstanceVertexId, 'root instance missing')

    const gateInstanceRefs = await g
      .V(rootInstanceVertexId)
      .out(domain.edge.uses_gate.componentInstance_gateInstanceRef.constants.LABEL)
      .id()
    assert.equal(gateInstanceRefs.length, 1)

    const [gateRefId] = await g
      .V(rootComponentId)
      .out(domain.edge.has_gate.component_gateRef.constants.LABEL)
      .id()
    assert.ok(gateRefId, 'gateRef missing')

    const [linkedGateRefId] = await g
      .V(gateInstanceRefs[0])
      .out(domain.edge.uses_gate.gateInstanceRef_gateRef.constants.LABEL)
      .id()
    assert.equal(linkedGateRefId, gateRefId)

    const [gatedInstanceVertexId] = await g
      .V(gateInstanceRefs[0])
      .out(domain.edge.uses_gate.gateInstanceRef_componentInstance.constants.LABEL)
      .id()
    assert.ok(gatedInstanceVertexId, 'gated instance missing')

    const [gatedComponentId] = await g
      .V(gateRefId)
      .out(domain.edge.gate_of.gateRef_component.constants.LABEL)
      .id()
    const [gatedInstanceComponentId] = await g
      .V(gatedInstanceVertexId)
      .out(domain.edge.instance_of.componentInstance_component.constants.LABEL)
      .id()
    assert.equal(gatedInstanceComponentId, gatedComponentId)
  })
})

test('create builds componentInstances for imports and links via importInstanceRef', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const sharedComponent = componentBuilder('SharedComponent').toJSON()
    const component = componentBuilder('ParentComponent')
      .import('shared', { hash: sharedComponent.hash })
      .toJSON()

    await registerComponent(sharedComponent, { diagnostics, dataMapper, g })
    await registerComponent(component, { diagnostics, dataMapper, g })

    const instanceId = 'parent-instance'
    const componentId = await getComponentId({ g, diagnostics, componentHash: component.hash })
    const imports = await loadImports({ g, componentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: component.hash, componentId, instanceId, imports })

    const [parentInstanceVertexId] = await g
      .V()
      .has('label', domain.vertex.componentInstance.constants.LABEL)
      .has('instanceId', instanceId)
      .id()
    assert.ok(parentInstanceVertexId, 'parent componentInstance missing')

    const importInstanceRefIds = await g
      .V(parentInstanceVertexId)
      .out(domain.edge.uses_import.componentInstance_importInstanceRef.constants.LABEL)
      .id()
    assert.equal(importInstanceRefIds.length, 1, 'importInstanceRef missing')

    const [importInstanceRefId] = importInstanceRefIds
    const [importedInstanceVertexId] = await g
      .V(importInstanceRefId)
      .out(domain.edge.uses_import.importInstanceRef_componentInstance.constants.LABEL)
      .id()
    const [importRefId] = await g
      .V(importInstanceRefId)
      .out(domain.edge.uses_import.importInstanceRef_importRef.constants.LABEL)
      .id()
    const [importRefValues] = await g.V(importRefId).valueMap('alias')
    const aliasValue = Array.isArray(importRefValues.alias) ? importRefValues.alias[0] : importRefValues.alias
    assert.equal(aliasValue, component.imports[0].name)

    const [importedInstanceRow] = await g.V(importedInstanceVertexId).valueMap('instanceId')
    const importedInstanceId = Array.isArray(importedInstanceRow.instanceId)
      ? importedInstanceRow.instanceId[0]
      : importedInstanceRow.instanceId
    assert.ok(importedInstanceId, 'imported componentInstance missing instanceId')

    const [sharedComponentId] = await g
      .V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', sharedComponent.hash)
      .id()
    const importedComponentIds = await g
      .V(importedInstanceVertexId)
      .out(domain.edge.instance_of.componentInstance_component.constants.LABEL)
      .id()
    assert.deepEqual(importedComponentIds, [sharedComponentId])

    const [stateMachineId] = await g
      .V(importedInstanceVertexId)
      .out(domain.edge.has_stateMachine.componentInstance_stateMachine.constants.LABEL)
      .id()
    assert.ok(stateMachineId, 'imported componentInstance missing stateMachine')
  })
})

test('create recursively builds componentInstances for nested imports', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const leafComponent = componentBuilder('NestedLeaf').toJSON()
    const midComponent = componentBuilder('NestedMid')
      .import('leaf', { hash: leafComponent.hash })
      .toJSON()
    const rootComponent = componentBuilder('NestedRoot')
      .import('mid', { hash: midComponent.hash })
      .toJSON()

    await registerComponent(leafComponent, { diagnostics, dataMapper, g })
    await registerComponent(midComponent, { diagnostics, dataMapper, g })
    await registerComponent(rootComponent, { diagnostics, dataMapper, g })

    const instanceId = 'root-instance-nested'
    const rootComponentId = await getComponentId({ g, diagnostics, componentHash: rootComponent.hash })
    const imports = await loadImports({ g, componentId: rootComponentId })
    const { importedInstances } = await createInstance(
      { diagnostics, dataMapper, g },
      { componentHash: rootComponent.hash, componentId: rootComponentId, instanceId, imports },
    )

    assert.equal(importedInstances.length, rootComponent.imports.length)

    const [rootInstanceVertexId] = await g
      .V()
      .has('label', domain.vertex.componentInstance.constants.LABEL)
      .has('instanceId', instanceId)
      .id()
    assert.ok(rootInstanceVertexId, 'root componentInstance missing')

    const midInstanceIds = await g
      .V(rootInstanceVertexId)
      .out(domain.edge.uses_import.componentInstance_importInstanceRef.constants.LABEL)
      .out(domain.edge.uses_import.importInstanceRef_componentInstance.constants.LABEL)
      .id()
    assert.equal(midInstanceIds.length, 1, 'mid-level importInstance missing')

    const [midInstanceVertexId] = midInstanceIds
    const midImportInstanceRefIds = await g
      .V(midInstanceVertexId)
      .out(domain.edge.uses_import.componentInstance_importInstanceRef.constants.LABEL)
      .id()
    assert.equal(midImportInstanceRefIds.length, 1, 'nested importInstanceRef missing')

    const [midImportInstanceRefId] = midImportInstanceRefIds
    const [nestedInstanceVertexId] = await g
      .V(midImportInstanceRefId)
      .out(domain.edge.uses_import.importInstanceRef_componentInstance.constants.LABEL)
      .id()
    assert.ok(nestedInstanceVertexId, 'nested imported componentInstance missing')

    const [nestedImportRefId] = await g
      .V(midImportInstanceRefId)
      .out(domain.edge.uses_import.importInstanceRef_importRef.constants.LABEL)
      .id()
    const [nestedAliasRow] = await g.V(nestedImportRefId).valueMap('alias')
    const nestedAliasValue = Array.isArray(nestedAliasRow?.alias ?? nestedAliasRow)
      ? (nestedAliasRow?.alias ?? nestedAliasRow)[0]
      : (nestedAliasRow?.alias ?? nestedAliasRow)
    assert.equal(nestedAliasValue, 'leaf')

    const [leafComponentId] = await g
      .V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', leafComponent.hash)
      .id()
    const nestedComponentIds = await g
      .V(nestedInstanceVertexId)
      .out(domain.edge.instance_of.componentInstance_component.constants.LABEL)
      .id()
    assert.deepEqual(nestedComponentIds, [leafComponentId], 'nested instance not linked to leaf component')
  })
})

test('handler rejects when componentHash is not registered', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    await assert.rejects((async () => {
      const componentHash = 'missing-component'
      const componentId = await getComponentId({ g, diagnostics, componentHash })
      await createInstance({ diagnostics, dataMapper, g }, { componentHash, componentId, instanceId: 'missing-instance' })
    })(), diagnostics.DiagnosticError)
  })
})

test('create handles multiple imports of the same component hash with unique aliases', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const sharedComponent = componentBuilder('SharedComponentMulti').toJSON()
    const component = componentBuilder('ParentComponentMulti')
      .import('shared-a', { hash: sharedComponent.hash })
      .import('shared-b', { hash: sharedComponent.hash })
      .toJSON()

    await registerComponent(sharedComponent, { diagnostics, dataMapper, g })
    await registerComponent(component, { diagnostics, dataMapper, g })

    const instanceId = 'parent-instance-multi'
    const componentId = await getComponentId({ g, diagnostics, componentHash: component.hash })
    const imports = await loadImports({ g, componentId })
    const { importedInstances } = await createInstance({ diagnostics, dataMapper, g }, { componentHash: component.hash, componentId, instanceId, imports })

    const [parentInstanceVertexId] = await g
      .V()
      .has('label', domain.vertex.componentInstance.constants.LABEL)
      .has('instanceId', instanceId)
      .id()
    assert.ok(parentInstanceVertexId, 'parent componentInstance missing')

    const importInstanceRefIds = await g
      .V(parentInstanceVertexId)
      .out(domain.edge.uses_import.componentInstance_importInstanceRef.constants.LABEL)
      .id()

    const importAliases = []
    for (const importInstanceRefId of importInstanceRefIds ?? []) {
      const [importRefId] = await g
        .V(importInstanceRefId)
        .out(domain.edge.uses_import.importInstanceRef_importRef.constants.LABEL)
        .id()
      const [values] = await g.V(importRefId).valueMap('alias')
      const aliasValue = Array.isArray(values?.alias ?? values)
        ? (values?.alias ?? values)[0]
        : (values?.alias ?? values)
      importAliases.push(aliasValue)
    }
    importAliases.sort()
    const expectedAliases = component.imports.map(({ name }) => name).sort()

    assert.deepEqual(importAliases, expectedAliases, 'importInstanceRefs missing expected aliases')
    assert.equal(importAliases.length, component.imports.length, 'missing importInstanceRefs')
    assert.deepEqual(
      importedInstances.map(({ alias }) => alias).sort(),
      expectedAliases,
      'handler returned incorrect imports',
    )
  })
})

test('publishEvents does not start imported componentInstances after creation', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const sharedComponent = componentBuilder('SharedComponentTwo').toJSON()
    const component = componentBuilder('ParentComponentTwo')
      .import('shared', { hash: sharedComponent.hash })
      .toJSON()

    await registerComponent(sharedComponent, { diagnostics, dataMapper, g })
    await registerComponent(component, { diagnostics, dataMapper, g })

    const instanceId = 'parent-instance-two'
    const componentId = await getComponentId({ g, diagnostics, componentHash: component.hash })
    const imports = await loadImports({ g, componentId })
    const handlerResult = await createInstance({ diagnostics, dataMapper, g }, { componentHash: component.hash, componentId, instanceId, imports })
    const scope = { componentHash: component.hash, instanceId, ...handlerResult }

    const published = []
    const natsContext = { publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }) }

    await publishCreateInstanceEvents({ rootCtx: { natsContext }, scope })

    const createSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('componentInstance')
      .channel('evt')
      .action('created')
      .version('v1')
      .build()

    const createEvents = published.filter(({ subject }) => subject === createSubject)
    assert.equal(createEvents.length, 1)
    assert.deepEqual(createEvents[0].payload.data, { instanceId, componentHash: component.hash })
    assert.equal(handlerResult.importedInstances.length, component.imports.length)

    const startCommands = published.filter(({ subject }) => subject.includes('.cmd.componentInstance.start.'))
    assert.equal(startCommands.length, 0, 'start commands should not be published during creation')
  })
})

test('start publishes start commands for imported componentInstances', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const sharedComponent = componentBuilder('SharedComponentThree').toJSON()
    const component = componentBuilder('ParentComponentThree')
      .import('shared', { hash: sharedComponent.hash })
      .toJSON()

    await registerComponent(sharedComponent, { diagnostics, dataMapper, g })
    await registerComponent(component, { diagnostics, dataMapper, g })

    const instanceId = 'parent-instance-three'
    const componentId = await getComponentId({ g, diagnostics, componentHash: component.hash })
    const imports = await loadImports({ g, componentId })
    const handlerResult = await createInstance({ diagnostics, dataMapper, g }, { componentHash: component.hash, componentId, instanceId, imports })

    const [parentInstanceVertexId] = await g
      .V()
      .has('label', domain.vertex.componentInstance.constants.LABEL)
      .has('instanceId', instanceId)
      .id()
    assert.ok(parentInstanceVertexId, 'parent componentInstance missing')

    const { usesImportInstances: importInstances } = await usesImportInstances({
      rootCtx: { g },
      scope: { instanceVertexId: parentInstanceVertexId },
    })
    const importInstanceIds = importInstances.map(({ instanceId }) => instanceId)
    assert.equal(importInstanceIds.length, handlerResult.importedInstances.length)

    const published = []
    const natsContext = { publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }) }

    await publishStartInstanceEvents({
      rootCtx: { natsContext },
      scope: {
        instanceId,
        dataStateIds: [],
        taskStateIds: [],
        usesImportInstances: importInstances,
      },
    })

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

    const startCommands = published.filter(({ subject }) => subject === startImportSubject)
    assert.equal(startCommands.length, importInstanceIds.length)
    assert.deepEqual(
      startCommands.map(({ payload }) => payload.data.instanceId).sort(),
      [...importInstanceIds].sort(),
    )
    assert.ok(startCommands.every(({ payload }) => payload.data.parentInstanceId === instanceId))

    const startedEvents = published.filter(({ subject }) => subject === startedSubject)
    assert.equal(startedEvents.length, 1)
    assert.deepEqual(startedEvents[0].payload.data, { instanceId })
  })
})
