import test from 'node:test'
import assert from 'node:assert/strict'
import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import {
  createBasicSubject,
  createComputeFunctionSubject,
  createResultComputedSubject,
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
      subject: createComputeFunctionSubject('data'),
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
    assert.equal(published[0].subject, createResultComputedSubject())

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

test('computeFunction stores state result, marks status provided, and publishes start_dependants', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('ComputeResultDoneComponent')
      .data('dataInput', { deps: () => { } })
      .toJSON()

    await registerComponent(component, { diagnostics, dataMapper, g })

    const instanceId = 'instance-result-computed'
    const componentId = await getComponentId({ g, dataMapper, diagnostics, componentHash: component.hash })
    const imports = await loadImports({ g, dataMapper, componentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: component.hash, componentId, instanceId, imports })

    const { stateMachineId } = await getStateMachineId({ g, dataMapper, instanceId })
    const [stateEdgeId] = await dataMapper.query.findDataStateEdgeIdByName({ vertexId: stateMachineId, name: component.data[0].name })
    assert.ok(stateEdgeId, 'data state edge missing')

    const [initialValues] = await dataMapper.query.readInitialValues({ edgeId: stateEdgeId })
    const initialUpdatedAt = pickFirst(initialValues?.updatedAt)
    assert.ok(initialUpdatedAt, 'initial updatedAt missing')

    const published = []
    let acked = false
    const message = {
      subject: createComputeFunctionSubject('data'),
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

    assert.equal(finalScope.stateEdgeId, stateEdgeId)
    assert.equal(acked, true)

    const [updatedValues] = await dataMapper.query.readStateEdgeStatusResultAndUpdatedAt({ edgeId: stateEdgeId })
    assert.equal(pickFirst(updatedValues.status), STATE_EDGE_STATUS_BY_TYPE.data)
    assert.equal(pickFirst(updatedValues.result), JSON.stringify({ count: 2 }))
    assert.notEqual(pickFirst(updatedValues.updatedAt), initialUpdatedAt)

    const startDependantsSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.start_dependants.v1['*']).forPublish()
      .env('prod')
      .build()
    const completionSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].evt.componentInstance.state_machine_completed.v1['*']).forPublish()
      .env('prod')
      .build()

    const startDependantsEvents = published.filter(p => p.subject === startDependantsSubject)
    assert.equal(startDependantsEvents.length, 1)
    assertDataStartDependantsPayload(startDependantsEvents[0].payload.data, {
      instanceId,
      stateEdgeId,
      result: { count: 2 },
    })

    const completionEvents = published.filter(p => p.subject === completionSubject)
    assert.equal(completionEvents.length, 1)
    assert.deepEqual(completionEvents[0].payload.data, { instanceId, stateMachineId })
  })
})

test('validatePayload accepts payloads without a type field', () => {
  const diagnostics = makeDiagnosticsInstance()
  const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { instanceId: 'i-1', name: 'x' })
  assert.doesNotThrow(() => validatePayload({
    scope: { handlerDiagnostics, instanceId: 'i-1', name: 'x' },
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
