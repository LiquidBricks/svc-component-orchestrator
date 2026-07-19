import test from 'node:test'
import assert from 'node:assert/strict'
import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { Graph } from '@liquid-bricks/lib-nats-graph/graph'
import { diagnostics as makeDiagnostics } from '@liquid-bricks/lib-diagnostics'
import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { ulid } from 'ulid'

import { createComponentServiceRouter } from '../../../../../router.js'
import { path as registerPath } from '../../../../../core/componentAgent/cmd/registerComponent/index.js'
import { dataMapper as createDataMapper, domain } from '@liquid-bricks/spec-domain/domain'
import { publishEvents as publishCreateInstanceEvents } from '../../../../../core/componentInstance/cmd/create/publishEvents/index.js'
import { publishEvents as publishStartInstanceEvents } from '../../../../../core/domain/vertex/stateMachine/started/publishEvents/index.js'
import { spec as stateMachineStartedSpec } from '../../../../../core/domain/vertex/stateMachine/started/index.js'
import { usesImportInstances } from '../../../../../core/componentInstance/cmd/start/loadData/usesImportInstances.js'
import { componentImports } from '../../../../../core/componentInstance/cmd/create/loadData/componentImports.js'
import { componentGates } from '../../../../../core/componentInstance/cmd/create/loadData/componentGates.js'
import { serviceConfiguration } from '../../../../provider/serviceConfiguration/dotenv/index.js'
import { invokeRoute, runHookGroup } from '../../../../util/invokeRoute.js'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


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
  await invokeRoute(ctx, { path: registerPath, data: { component, agentID: 'test-agent' } })
}

async function createInstance(ctx, scope) {
  const handlerDiagnostics = createHandlerDiagnostics(ctx.diagnostics, scope)
  return createInstanceSpec.handler({ rootCtx: ctx, scope: { ...scope, handlerDiagnostics } })
}

async function loadImports({ g, dataMapper, componentId }) {
  const { imports = [] } = await componentImports({ rootCtx: { g, dataMapper }, scope: { componentId } })
  return imports
}

async function loadGates({ g, dataMapper, componentId }) {
  const { gates = [] } = await componentGates({ rootCtx: { g, dataMapper }, scope: { componentId } })
  return gates
}

async function getComponentId({ g, dataMapper, diagnostics, componentHash }) {
  const [componentId] = await dataMapper.query.findComponentIdByHash({ hash: componentHash })
  diagnostics.require(
    componentId,
    diagnostics.DiagnosticError,
    `component not found for componentHash ${componentHash}`,
  )
  return componentId
}

function readProperty(row, property) {
  const value = row?.[property] ?? row
  return Array.isArray(value) ? value[0] : value
}

function normalizeState(value) {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

async function readComponentSnapshot({ dataMapper, instanceVertexId }) {
  const componentStateIds = await dataMapper.query.readComponentStateId({ vertexId: instanceVertexId })
  assert.equal(componentStateIds.length, 1, 'componentInstance must have exactly one componentState')

  const [row] = await dataMapper.query.readComponentState({ vertexId: componentStateIds[0] })
  return {
    componentStateId: componentStateIds[0],
    state: normalizeState(readProperty(row, 'state')),
  }
}

test('handler creates componentInstance snapshot stateMachine and links data/task states', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('ComponentStateMachine')
      .task('taskA', {})
      .task('taskB', {})
      .data('dataA', { deps: () => { } })
      .toJSON()

    await registerComponent(component, { diagnostics, dataMapper, g })

    const [componentId] = await dataMapper.query.findComponentIdByHash({ hash: component.hash })
    const instanceId = 'instance-state-machine'
    const imports = await loadImports({ g, dataMapper, componentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: component.hash, componentId, instanceId, imports })

    const [instanceVertexId] = await dataMapper.query.findInstanceVertexId({ instanceId })
    assert.ok(instanceVertexId, 'componentInstance vertex missing')

    const instanceOfIds = await dataMapper.query.listInstanceOfIds({ vertexId: instanceVertexId })
    assert.deepEqual(instanceOfIds, [componentId])

    const snapshot = await readComponentSnapshot({ dataMapper, instanceVertexId })
    assert.ok(snapshot.componentStateId)
    assert.deepEqual(snapshot.state, {
      'data.dataA': null,
      'task.taskA': null,
      'task.taskB': null,
    })

    const [stateMachineId] = await dataMapper.query.readStateMachineId({ vertexId: instanceVertexId })
    assert.ok(stateMachineId, 'stateMachine vertex missing')

    const componentDataIds = await dataMapper.query.listComponentDataIds({ vertexId: componentId })
    const componentTaskIds = await dataMapper.query.listComponentTaskIds({ vertexId: componentId })

    const stateMachineDataIds = await dataMapper.query.readStateMachineDataIds({ vertexId: stateMachineId })
    assert.deepEqual(stateMachineDataIds.sort(), componentDataIds.sort())

    const stateMachineTaskIds = await dataMapper.query.readStateMachineTaskIds({ vertexId: stateMachineId })
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

    const rootComponentId = await getComponentId({ g, dataMapper, diagnostics, componentHash: rootComponent.hash })
    const gates = await loadGates({ g, dataMapper, componentId: rootComponentId })

    const instanceId = 'instance-gate-root'
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: rootComponent.hash, componentId: rootComponentId, instanceId, imports: [], gates })

    const [rootInstanceVertexId] = await dataMapper.query.findRootInstanceVertexId({ instanceId })
    assert.ok(rootInstanceVertexId, 'root instance missing')

    const gateInstanceRefs = await dataMapper.query.readGateInstanceRefs({ vertexId: rootInstanceVertexId })
    assert.equal(gateInstanceRefs.length, 1)

    const [rootStateMachineId] = await dataMapper.query.readStateMachineId({ vertexId: rootInstanceVertexId })
    const gateStateEdgeIds = await dataMapper.query.listGateStateEdgeIds({ vertexId: rootStateMachineId })
    assert.equal(gateStateEdgeIds.length, 1)
    const [gateStateTargetId] = await dataMapper.query.findEdgeTargetNodeId({ edgeId: gateStateEdgeIds[0] })
    assert.equal(gateStateTargetId, gateInstanceRefs[0])

    const [gateRefId] = await dataMapper.query.listGateRefIds({ vertexId: rootComponentId })
    assert.ok(gateRefId, 'gateRef missing')

    const [linkedGateRefId] = await dataMapper.query.findLinkedGateRefId({ vertexId: gateInstanceRefs[0] })
    assert.equal(linkedGateRefId, gateRefId)

    const [gatedInstanceVertexId] = await dataMapper.query.findGatedInstanceVertexIdForRef({ vertexId: gateInstanceRefs[0] })
    assert.ok(gatedInstanceVertexId, 'gated instance missing')

    const rootSnapshot = await readComponentSnapshot({ dataMapper, instanceVertexId: rootInstanceVertexId })
    assert.deepEqual(rootSnapshot.state, { 'gate.setup': null })

    const gatedSnapshot = await readComponentSnapshot({ dataMapper, instanceVertexId: gatedInstanceVertexId })
    assert.deepEqual(gatedSnapshot.state, { 'data.ready': null })

    const [gatedComponentId] = await dataMapper.query.findGatedComponentIdForGateRef({ vertexId: gateRefId })
    const [gatedInstanceComponentId] = await dataMapper.query.findGatedInstanceComponentId({ vertexId: gatedInstanceVertexId })
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
    const componentId = await getComponentId({ g, dataMapper, diagnostics, componentHash: component.hash })
    const imports = await loadImports({ g, dataMapper, componentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: component.hash, componentId, instanceId, imports })

    const [parentInstanceVertexId] = await dataMapper.query.findParentInstanceVertexId({ instanceId })
    assert.ok(parentInstanceVertexId, 'parent componentInstance missing')

    const importInstanceRefIds = await dataMapper.query.listImportInstanceRefIds({ vertexId: parentInstanceVertexId })
    assert.equal(importInstanceRefIds.length, 1, 'importInstanceRef missing')

    const [importInstanceRefId] = importInstanceRefIds
    const [importedInstanceVertexId] = await dataMapper.query.findImportedInstanceVertexIdForRef({ vertexId: importInstanceRefId })

    const parentSnapshot = await readComponentSnapshot({ dataMapper, instanceVertexId: parentInstanceVertexId })
    assert.deepEqual(parentSnapshot.state, {})

    const importedSnapshot = await readComponentSnapshot({ dataMapper, instanceVertexId: importedInstanceVertexId })
    assert.deepEqual(importedSnapshot.state, {})

    const [importRefId] = await dataMapper.query.findImportRefIdForInstanceRef({ vertexId: importInstanceRefId })
    const [importRefValues] = await dataMapper.query.readImportRefValues({ vertexId: importRefId })
    const aliasValue = Array.isArray(importRefValues.alias) ? importRefValues.alias[0] : importRefValues.alias
    assert.equal(aliasValue, component.imports[0].name)

    const [importedInstanceRow] = await dataMapper.query.readComponentInstanceId({ vertexId: importedInstanceVertexId })
    const importedInstanceId = Array.isArray(importedInstanceRow.instanceId)
      ? importedInstanceRow.instanceId[0]
      : importedInstanceRow.instanceId
    assert.ok(importedInstanceId, 'imported componentInstance missing instanceId')

    const [sharedComponentId] = await dataMapper.query.findSharedComponentId({ hash: sharedComponent.hash })
    const importedComponentIds = await dataMapper.query.listImportedComponentIds({ vertexId: importedInstanceVertexId })
    assert.deepEqual(importedComponentIds, [sharedComponentId])

    const [stateMachineId] = await dataMapper.query.readStateMachineId({ vertexId: importedInstanceVertexId })
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
    const rootComponentId = await getComponentId({ g, dataMapper, diagnostics, componentHash: rootComponent.hash })
    const imports = await loadImports({ g, dataMapper, componentId: rootComponentId })
    const { importedInstances } = await createInstance(
      { diagnostics, dataMapper, g },
      { componentHash: rootComponent.hash, componentId: rootComponentId, instanceId, imports },
    )

    assert.equal(importedInstances.length, rootComponent.imports.length)

    const [rootInstanceVertexId] = await dataMapper.query.findRootInstanceVertexId({ instanceId })
    assert.ok(rootInstanceVertexId, 'root componentInstance missing')

    const midInstanceIds = await dataMapper.query.listMidInstanceIds({ vertexId: rootInstanceVertexId })
    assert.equal(midInstanceIds.length, 1, 'mid-level importInstance missing')

    const [midInstanceVertexId] = midInstanceIds
    const midImportInstanceRefIds = await dataMapper.query.listMidImportInstanceRefIds({ vertexId: midInstanceVertexId })
    assert.equal(midImportInstanceRefIds.length, 1, 'nested importInstanceRef missing')

    const [midImportInstanceRefId] = midImportInstanceRefIds
    const [nestedInstanceVertexId] = await dataMapper.query.findNestedInstanceVertexId({ vertexId: midImportInstanceRefId })
    assert.ok(nestedInstanceVertexId, 'nested imported componentInstance missing')

    const [nestedImportRefId] = await dataMapper.query.findNestedImportRefId({ vertexId: midImportInstanceRefId })
    const [nestedAliasRow] = await dataMapper.query.readNestedAliasRow({ vertexId: nestedImportRefId })
    const nestedAliasValue = Array.isArray(nestedAliasRow?.alias ?? nestedAliasRow)
      ? (nestedAliasRow?.alias ?? nestedAliasRow)[0]
      : (nestedAliasRow?.alias ?? nestedAliasRow)
    assert.equal(nestedAliasValue, 'leaf')

    const [leafComponentId] = await dataMapper.query.findLeafComponentId({ hash: leafComponent.hash })
    const nestedComponentIds = await dataMapper.query.listNestedComponentIds({ vertexId: nestedInstanceVertexId })
    assert.deepEqual(nestedComponentIds, [leafComponentId], 'nested instance not linked to leaf component')
  })
})

test('handler rejects when componentHash is not registered', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    await assert.rejects((async () => {
      const componentHash = 'missing-component'
      const componentId = await getComponentId({ g, dataMapper, diagnostics, componentHash })
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
    const componentId = await getComponentId({ g, dataMapper, diagnostics, componentHash: component.hash })
    const imports = await loadImports({ g, dataMapper, componentId })
    const { importedInstances } = await createInstance({ diagnostics, dataMapper, g }, { componentHash: component.hash, componentId, instanceId, imports })

    const [parentInstanceVertexId] = await dataMapper.query.findParentInstanceVertexId({ instanceId })
    assert.ok(parentInstanceVertexId, 'parent componentInstance missing')

    const importInstanceRefIds = await dataMapper.query.listImportInstanceRefIds({ vertexId: parentInstanceVertexId })

    const importAliases = []
    for (const importInstanceRefId of importInstanceRefIds ?? []) {
      const [importRefId] = await dataMapper.query.findImportRefIdForInstanceRef({ vertexId: importInstanceRefId })
      const [values] = await dataMapper.query.readValues({ vertexId: importRefId })
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
    const componentId = await getComponentId({ g, dataMapper, diagnostics, componentHash: component.hash })
    const imports = await loadImports({ g, dataMapper, componentId })
    const handlerResult = await createInstance({ diagnostics, dataMapper, g }, { componentHash: component.hash, componentId, instanceId, imports })
    const scope = { componentHash: component.hash, instanceId, ...handlerResult }

    const published = []
    const natsContext = { publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }) }

    await runHookGroup(publishCreateInstanceEvents, { rootCtx: { natsContext }, routeCtx: createInstanceSpec.context, scope })

    const createSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].evt.componentInstance.createDone.v1['*']).forPublish()
      .env('prod')
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
    const componentId = await getComponentId({ g, dataMapper, diagnostics, componentHash: component.hash })
    const imports = await loadImports({ g, dataMapper, componentId })
    const handlerResult = await createInstance({ diagnostics, dataMapper, g }, { componentHash: component.hash, componentId, instanceId, imports })

    const [parentInstanceVertexId] = await dataMapper.query.findParentInstanceVertexId({ instanceId })
    assert.ok(parentInstanceVertexId, 'parent componentInstance missing')

    const { usesImportInstances: importInstances } = await usesImportInstances({
      rootCtx: { g, dataMapper },
      scope: { instanceVertexId: parentInstanceVertexId },
    })
    const importInstanceIds = importInstances.map(({ instanceId }) => instanceId)
    assert.equal(importInstanceIds.length, handlerResult.importedInstances.length)

    const published = []
    const natsContext = { publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }) }

    await runHookGroup(publishStartInstanceEvents, {
      rootCtx: { natsContext },
      routeCtx: stateMachineStartedSpec.context,
      scope: {
        instanceId,
        dataStateIds: [],
        taskStateIds: [],
        usesImportInstances: importInstances,
      },
    })

    const startImportSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.import.start.v1['*']).forPublish()
      .env('prod')
      .build()
    const startDoneSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].evt.componentInstance.startDone.v1['*']).forPublish()
      .env('prod')
      .build()

    const startCommands = published.filter(({ subject }) => subject === startImportSubject)
    assert.equal(startCommands.length, importInstanceIds.length)
    assert.deepEqual(
      startCommands.map(({ payload }) => payload.data.instanceId).sort(),
      [...importInstanceIds].sort(),
    )
    assert.ok(startCommands.every(({ payload }) => payload.data.parentInstanceId === instanceId))

    const startDoneEvents = published.filter(({ subject }) => subject === startDoneSubject)
    assert.equal(startDoneEvents.length, 1)
    assert.deepEqual(startDoneEvents[0].payload.data, { instanceId })
  })
})
