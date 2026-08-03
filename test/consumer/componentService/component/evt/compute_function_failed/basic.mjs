import test from 'node:test'
import assert from 'node:assert/strict'

import { validatePayload } from '../../../../../../core/component/evt/compute_function_failed/_helper/validatePayload.js'
import {
  computeFunctionFailedDataSubject,
  computeFunctionFailedGateSubject,
  computeFunctionFailedTaskSubject,
  computeFunctionFailedSpec,
  createHandlerDiagnostics,
  dataComputationFailedSubject,
  gateComputationFailedSubject,
  makeDiagnosticsInstance,
  runSpec,
  taskComputationFailedSubject,
} from '../compute_function/helpers.mjs'

const SUBJECT_BY_TYPE = Object.freeze({
  data: computeFunctionFailedDataSubject,
  gate: computeFunctionFailedGateSubject,
  task: computeFunctionFailedTaskSubject,
})

const DOMAIN_SUBJECT_BY_TYPE = Object.freeze({
  data: dataComputationFailedSubject,
  gate: gateComputationFailedSubject,
  task: taskComputationFailedSubject,
})

function dataMapperFor(type, updates) {
  return {
    query: {
      findInstanceVertexId: async () => ['instance-vertex'],
      readStateMachineId: async () => ['state-machine'],
      findDataStateEdgeIdByName: async () => type === 'data' ? ['state-edge'] : [],
      findTaskStateEdgeIdByName: async () => type === 'task' ? ['state-edge'] : [],
      findGateInstanceRefIdByAlias: async () => type === 'gate' ? ['gate-instance-ref'] : [],
      findGateStateEdgeIdForTargetNode: async () => type === 'gate' ? ['state-edge'] : [],
    },
    edge: {
      has_data_state: {
        stateMachine_data: {
          updateStatusUpdatedAt: async update => updates.push({ type: 'data', update }),
        },
      },
      has_gate_state: {
        stateMachine_gateInstanceRef: {
          updateStatusUpdatedAt: async update => updates.push({ type: 'gate', update }),
        },
      },
      has_task_state: {
        stateMachine_task: {
          updateStatusUpdatedAt: async update => updates.push({ type: 'task', update }),
        },
      },
    },
  }
}

for (const type of ['data', 'gate', 'task']) {
  test(`computeFunctionFailed ${type} route emits only computation_failed and projects status without a result`, async () => {
    const diagnostics = makeDiagnosticsInstance()
    const error = { name: 'Error', message: `${type} computation failed`, code: 'COMPUTE_FAILED' }
    const published = []
    const updates = []
    let acked = false
    const message = {
      subject: SUBJECT_BY_TYPE[type],
      ack: () => { acked = true },
      json: () => ({
        data: {
          instanceId: 'instance-id',
          type,
          name: `${type}Name`,
          status: 'error',
          error,
        },
      }),
    }
    const rootCtx = {
      diagnostics,
      g: {},
      dataMapper: dataMapperFor(type, updates),
      natsContext: {
        publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }),
      },
    }

    const scope = await runSpec({ spec: computeFunctionFailedSpec, rootCtx, message })

    assert.equal(acked, true)
    assert.equal(scope.status, 'error')
    assert.equal(scope.stateEdgeStatus, 'error')
    assert.equal(published.length, 1)
    assert.equal(published[0].subject, DOMAIN_SUBJECT_BY_TYPE[type])

    const fact = published[0].payload.data
    assert.equal(typeof fact.updatedAt, 'string')
    assert.deepEqual({ ...fact, updatedAt: '<updatedAt>' }, {
      instanceId: 'instance-id',
      instanceVertexId: 'instance-vertex',
      stateMachineId: 'state-machine',
      stateEdgeId: 'state-edge',
      stateId: 'state-edge',
      ...(type === 'gate' ? { gateInstanceRefId: 'gate-instance-ref' } : {}),
      type,
      name: `${type}Name`,
      status: 'error',
      stateEdgeStatus: 'error',
      error,
      updatedAt: '<updatedAt>',
    })
    assert.equal(Object.hasOwn(fact, 'result'), false)
    assert.equal(Object.hasOwn(fact, 'resultValue'), false)

    assert.equal(updates.length, 1)
    assert.equal(updates[0].type, type)
    assert.deepEqual(updates[0].update, {
      edgeId: 'state-edge',
      status: 'error',
      updatedAt: fact.updatedAt,
    })
    assert.equal(Object.hasOwn(updates[0].update, 'result'), false)
  })
}

test('computeFunctionFailed validation accepts a structured error without result fields', () => {
  const diagnostics = makeDiagnosticsInstance()
  const error = { name: 'Error', message: 'failed' }
  const scope = { instanceId: 'i-1', name: 'x', status: 'error', error }
  const handlerDiagnostics = createHandlerDiagnostics(diagnostics, scope)

  assert.deepEqual(validatePayload({ scope: { handlerDiagnostics, ...scope } }), {
    status: 'error',
    stateEdgeStatus: 'error',
    error,
  })
})

for (const invalid of [
  { status: undefined, error: { name: 'Error', message: 'failed' } },
  { status: 'provided', error: { name: 'Error', message: 'failed' } },
  { status: 'error', stateEdgeStatus: 'provided', error: { name: 'Error', message: 'failed' } },
  { status: 'error', error: undefined },
  { status: 'error', error: 'failed' },
  { status: 'error', error: { message: 'failed' } },
  { status: 'error', error: { name: 'Error' } },
  { status: 'error', error: { name: 'Error', message: 'failed', code: {} } },
  { status: 'error', error: { name: 'Error', message: 'failed' }, result: null },
  { status: 'error', error: { name: 'Error', message: 'failed' }, resultValue: '' },
]) {
  test(`computeFunctionFailed validation rejects invalid failure fields: ${JSON.stringify(invalid)}`, () => {
    const diagnostics = makeDiagnosticsInstance()
    const scope = { instanceId: 'i-1', name: 'x', ...invalid }
    const handlerDiagnostics = createHandlerDiagnostics(diagnostics, scope)

    assert.throws(
      () => validatePayload({ scope: { handlerDiagnostics, ...scope } }),
      diagnostics.DiagnosticError,
    )
  })
}
