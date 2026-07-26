import test from 'node:test'
import assert from 'node:assert/strict'
import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { componentGates } from '../../../../../../core/componentInstance/cmd/create/loadData/componentGates.js'

import {
  createBasicSubject,
  computeFunctionDataSubject,
  computeFunctionGateSubject,
  computeFunctionTaskSubject,
  taskResultComputedSubject,
  gateResultComputedSubject,
  checkStateMachineCompletionSubject,
  stateMachineCompletedFactSubject,
  runCheckStateMachineCompletionCommands,
  assertDataStartDependantsPayload,
  withGraphContext,
  registerComponent,
  createInstance,
  loadImports,
  getComponentId,
  getStateMachineId,
  pickFirst,
  runSpec,
  computeFunctionSpec,
  STATE_EDGE_STATUS_BY_TYPE,
  createHandlerDiagnostics,
  makeDiagnosticsInstance,
  validatePayload,
  domain,
} from './helpers.mjs'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


async function loadGates({ g, dataMapper, componentId }) {
  const { gates = [] } = await componentGates({ rootCtx: { g, dataMapper }, scope: { componentId } })
  return gates
}


test('computeFunction data route publishes result_computed domain fact only', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('ComputeResultDomainFactComponent')
      .data('dataInput', { deps: () => { } })
      .toJSON()

    await registerComponent(component, { diagnostics, dataMapper, g })

    const instanceId = 'instance-result-domain-fact'
    const componentId = await getComponentId({ g, dataMapper, diagnostics, componentHash: component.hash })
    const imports = await loadImports({ g, dataMapper, componentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: component.hash, componentId, instanceId, imports })

    const { stateMachineId } = await getStateMachineId({ g, dataMapper, instanceId })
    const [stateEdgeId] = await dataMapper.query.findDataStateEdgeIdByName({ vertexId: stateMachineId, name: component.data[0].name })
    assert.ok(stateEdgeId, 'data state edge missing')

    const [initialValues] = await dataMapper.query.readInitialValues({ edgeId: stateEdgeId })
    const initialUpdatedAt = pickFirst(initialValues?.updatedAt)
    assert.ok(initialUpdatedAt, 'initial updatedAt missing')

    const resultPayload = { count: 2 }
    const published = []
    let acked = false
    const message = {
      subject: computeFunctionDataSubject,
      ack: () => { acked = true },
      json: () => ({
        data: {
          instanceId,
          type: 'data',
          name: component.data[0].name,
          result: resultPayload,
        }
      }),
    }
    const rootCtx = {
      diagnostics,
      g,
      dataMapper,
      natsContext: { publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }) },
    }

    const finalScope = await runSpec({ spec: computeFunctionSpec, rootCtx, message, processDomainFacts: false })

    assert.equal(finalScope.stateEdgeId, stateEdgeId)
    assert.equal(acked, true)
    assert.equal(published.length, 1)
    assert.equal(
      published[0].subject,
      createBasicSubject(natsEvents['*'].domain['*']['*'].edge.has_data_state.result_computed.v1['*'])
        .forPublish()
        .env('prod')
        .build(),
    )

    const factData = published[0].payload.data
    assert.equal(typeof factData.updatedAt, 'string')
    assert.deepEqual({ ...factData, updatedAt: '<updatedAt>' }, {
      instanceId,
      instanceVertexId: finalScope.instanceVertexId,
      stateMachineId,
      stateEdgeId,
      stateId: stateEdgeId,
      type: 'data',
      name: component.data[0].name,
      result: resultPayload,
      resultValue: JSON.stringify(resultPayload),
      status: STATE_EDGE_STATUS_BY_TYPE.data,
      stateEdgeStatus: STATE_EDGE_STATUS_BY_TYPE.data,
      updatedAt: '<updatedAt>',
    })

    const [unchangedValues] = await dataMapper.query.readStateEdgeStatusResultAndUpdatedAt({ edgeId: stateEdgeId })
    assert.notEqual(pickFirst(unchangedValues.status), STATE_EDGE_STATUS_BY_TYPE.data)
    assert.notEqual(pickFirst(unchangedValues.result), JSON.stringify(resultPayload))
    assert.equal(pickFirst(unchangedValues.updatedAt), initialUpdatedAt)
  })
})

test('computeFunction task route publishes result_computed domain fact only', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const taskName = 'taskInput'
    const component = componentBuilder('ComputeTaskResultDomainFactComponent')
      .task(taskName, {})
      .toJSON()

    await registerComponent(component, { diagnostics, dataMapper, g })

    const instanceId = 'instance-task-result-domain-fact'
    const componentId = await getComponentId({ g, dataMapper, diagnostics, componentHash: component.hash })
    const imports = await loadImports({ g, dataMapper, componentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: component.hash, componentId, instanceId, imports })

    const { stateMachineId } = await getStateMachineId({ g, dataMapper, instanceId })
    const [stateEdgeId] = await dataMapper.query.findTaskStateEdgeIdByName({ vertexId: stateMachineId, name: taskName })
    assert.ok(stateEdgeId, 'task state edge missing')

    const [initialValues] = await dataMapper.query.readInitialValues({ edgeId: stateEdgeId })
    const initialUpdatedAt = pickFirst(initialValues?.updatedAt)
    assert.ok(initialUpdatedAt, 'initial updatedAt missing')

    const resultPayload = { count: 3 }
    const published = []
    let acked = false
    const message = {
      subject: computeFunctionTaskSubject,
      ack: () => { acked = true },
      json: () => ({
        data: {
          instanceId,
          type: 'task',
          name: taskName,
          result: resultPayload,
        }
      }),
    }
    const rootCtx = {
      diagnostics,
      g,
      dataMapper,
      natsContext: { publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }) },
    }

    const finalScope = await runSpec({ spec: computeFunctionSpec, rootCtx, message, processDomainFacts: false })

    assert.equal(finalScope.stateEdgeId, stateEdgeId)
    assert.equal(acked, true)
    assert.equal(published.length, 1)
    assert.equal(published[0].subject, taskResultComputedSubject)

    const factData = published[0].payload.data
    assert.equal(typeof factData.updatedAt, 'string')
    assert.deepEqual({ ...factData, updatedAt: '<updatedAt>' }, {
      instanceId,
      instanceVertexId: finalScope.instanceVertexId,
      stateMachineId,
      stateEdgeId,
      stateId: stateEdgeId,
      type: 'task',
      name: taskName,
      result: resultPayload,
      resultValue: JSON.stringify(resultPayload),
      status: STATE_EDGE_STATUS_BY_TYPE.task,
      stateEdgeStatus: STATE_EDGE_STATUS_BY_TYPE.task,
      updatedAt: '<updatedAt>',
    })

    const [unchangedValues] = await dataMapper.query.readStateEdgeStatusResultAndUpdatedAt({ edgeId: stateEdgeId })
    assert.notEqual(pickFirst(unchangedValues.status), STATE_EDGE_STATUS_BY_TYPE.task)
    assert.notEqual(pickFirst(unchangedValues.result), JSON.stringify(resultPayload))
    assert.equal(pickFirst(unchangedValues.updatedAt), initialUpdatedAt)
  })
})


test('computeFunction gate route publishes result_computed domain fact only', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const targetComponent = componentBuilder('ComputeGateResultDomainFactTarget').toJSON()
    const rootComponent = componentBuilder('ComputeGateResultDomainFactRoot')
      .gate('setup', { hash: targetComponent.hash, fnc: () => true })
      .toJSON()

    await registerComponent(targetComponent, { diagnostics, dataMapper, g })
    await registerComponent(rootComponent, { diagnostics, dataMapper, g })

    const instanceId = 'instance-gate-result-domain-fact'
    const componentId = await getComponentId({ g, dataMapper, diagnostics, componentHash: rootComponent.hash })
    const imports = await loadImports({ g, dataMapper, componentId })
    const gates = await loadGates({ g, dataMapper, componentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: rootComponent.hash, componentId, instanceId, imports, gates })

    const { stateMachineId, instanceVertexId } = await getStateMachineId({ g, dataMapper, instanceId })
    const [gateInstanceRefId] = await dataMapper.query.findGateInstanceRefIdByAlias({ vertexId: instanceVertexId, alias: 'setup' })
    assert.ok(gateInstanceRefId, 'gate instance ref missing')
    const [stateEdgeId] = await dataMapper.query.findGateStateEdgeIdForTargetNode({ vertexId: stateMachineId, id: gateInstanceRefId })
    assert.ok(stateEdgeId, 'gate state edge missing')

    const resultPayload = true
    const published = []
    let acked = false
    const message = {
      subject: computeFunctionGateSubject,
      ack: () => { acked = true },
      json: () => ({
        data: {
          instanceId,
          type: 'gate',
          name: 'setup',
          result: resultPayload,
        }
      }),
    }
    const rootCtx = {
      diagnostics,
      g,
      dataMapper,
      natsContext: { publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }) },
    }

    const finalScope = await runSpec({ spec: computeFunctionSpec, rootCtx, message, processDomainFacts: false })

    assert.equal(finalScope.gateInstanceRefId, gateInstanceRefId)
    assert.equal(finalScope.stateEdgeId, stateEdgeId)
    assert.equal(acked, true)
    assert.equal(published.length, 1)
    assert.equal(published[0].subject, gateResultComputedSubject)

    const factData = published[0].payload.data
    assert.equal(typeof factData.updatedAt, 'string')
    assert.deepEqual({ ...factData, updatedAt: '<updatedAt>' }, {
      instanceId,
      instanceVertexId,
      stateMachineId,
      stateEdgeId,
      stateId: stateEdgeId,
      gateInstanceRefId,
      type: 'gate',
      name: 'setup',
      result: resultPayload,
      resultValue: JSON.stringify(resultPayload),
      updatedAt: '<updatedAt>',
    })

    const [unchangedValues] = await dataMapper.query.readResultValues({ edgeId: stateEdgeId })
    assert.equal(pickFirst(unchangedValues?.result), null)
  })
})

test('computeFunction stores state result and drives completion through command and domain fact', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('ComputeResultDoneComponent')
      .data('dataInput', { deps: () => { } })
      .toJSON()

    await registerComponent(component, { diagnostics, dataMapper, g })

    const instanceId = 'instance-result-computed'
    const componentId = await getComponentId({ g, dataMapper, diagnostics, componentHash: component.hash })
    const imports = await loadImports({ g, dataMapper, componentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: component.hash, componentId, instanceId, imports })

    const { stateMachineId, instanceVertexId } = await getStateMachineId({ g, dataMapper, instanceId })
    const [stateEdgeId] = await dataMapper.query.findDataStateEdgeIdByName({ vertexId: stateMachineId, name: component.data[0].name })
    assert.ok(stateEdgeId, 'data state edge missing')

    const [initialValues] = await dataMapper.query.readInitialValues({ edgeId: stateEdgeId })
    const initialUpdatedAt = pickFirst(initialValues?.updatedAt)
    assert.ok(initialUpdatedAt, 'initial updatedAt missing')

    const published = []
    let acked = false
    const message = {
      subject: computeFunctionDataSubject,
      ack: () => { acked = true },
      json: () => ({
        data: {
          instanceId,
          type: 'data',
          name: component.data[0].name,
          result: { count: 2 },
        }
      }),
    }
    const rootCtx = {
      diagnostics,
      g,
      dataMapper,
      natsContext: { publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }) },
    }

    const finalScope = await runSpec({ spec: computeFunctionSpec, rootCtx, message })
    await runCheckStateMachineCompletionCommands({ rootCtx, events: published })

    assert.equal(finalScope.stateEdgeId, stateEdgeId)
    assert.equal(acked, true)

    const [updatedValues] = await dataMapper.query.readStateEdgeStatusResultAndUpdatedAt({ edgeId: stateEdgeId })
    assert.equal(pickFirst(updatedValues.status), STATE_EDGE_STATUS_BY_TYPE.data)
    assert.equal(pickFirst(updatedValues.result), JSON.stringify({ count: 2 }))
    assert.notEqual(pickFirst(updatedValues.updatedAt), initialUpdatedAt)

    const startDependantsSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.start_dependants.v1['*']).forPublish()
      .env('prod')
      .build()
    const startDependantsEvents = published.filter(p => p.subject === startDependantsSubject)
    assert.equal(startDependantsEvents.length, 1)
    assertDataStartDependantsPayload(startDependantsEvents[0].payload.data, {
      instanceId,
      stateEdgeId,
    })

    const checkEvents = published.filter(p => p.subject === checkStateMachineCompletionSubject)
    assert.equal(checkEvents.length, 1)
    assert.deepEqual(checkEvents[0].payload.data, {
      instanceId,
      instanceVertexId,
      stateMachineId,
      stateEdgeId,
      stateEdgeStatus: STATE_EDGE_STATUS_BY_TYPE.data,
      status: STATE_EDGE_STATUS_BY_TYPE.data,
      type: 'data',
      result: { count: 2 },
      resultValue: JSON.stringify({ count: 2 }),
    })

    const completedFacts = published.filter(p => p.subject === stateMachineCompletedFactSubject)
    assert.equal(completedFacts.length, 1)
    const { updatedAt, ...completedData } = completedFacts[0].payload.data
    assert.deepEqual(completedData, { instanceId, stateMachineId })
    assert.equal(typeof updatedAt, 'string')

    const [completedState] = await dataMapper.query.readStateMachineState({ vertexId: stateMachineId })
    assert.equal(
      pickFirst(completedState.state),
      domain.vertex.stateMachine.constants.STATES.COMPLETE,
    )
  })
})

test('validatePayload accepts payloads without a type field', () => {
  const diagnostics = makeDiagnosticsInstance()
  const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { instanceId: 'i-1', name: 'x', result: null })
  assert.doesNotThrow(() => validatePayload({
    scope: { handlerDiagnostics, instanceId: 'i-1', name: 'x', result: null },
    rootCtx: { diagnostics },
  }))
})

test('validatePayload rejects a missing name', () => {
  const diagnostics = makeDiagnosticsInstance()
  const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { instanceId: 'i-1' })
  assert.throws(
    () => validatePayload({ scope: { handlerDiagnostics, instanceId: 'i-1', name: '' }, rootCtx: { diagnostics } }),
    diagnostics.DiagnosticError,
  )
})

test('validatePayload rejects a missing native result', () => {
  const diagnostics = makeDiagnosticsInstance()
  const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { instanceId: 'i-1', name: 'x' })
  assert.throws(
    () => validatePayload({ scope: { handlerDiagnostics, instanceId: 'i-1', name: 'x' }, rootCtx: { diagnostics } }),
    diagnostics.DiagnosticError,
  )
})
