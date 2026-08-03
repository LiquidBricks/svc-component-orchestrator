import test from 'node:test'
import assert from 'node:assert/strict'
import { diagnostics as createDiagnostics } from '@liquid-bricks/lib-diagnostics'
import { ROUTER_HANDLER_ERROR } from '@liquid-bricks/lib-diagnostics/codes'
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

import { path as dataSnapshotResultPath } from '../../../../core/domain/snapshot/data/result/index.js'
import { path as gateSnapshotResultPath } from '../../../../core/domain/snapshot/gate/result/index.js'
import { path as taskSnapshotResultPath } from '../../../../core/domain/snapshot/task/result/index.js'
import { path as dataSnapshotFailurePath } from '../../../../core/domain/snapshot/data/computation_failed/index.js'
import { path as gateSnapshotFailurePath } from '../../../../core/domain/snapshot/gate/computation_failed/index.js'
import { path as taskSnapshotFailurePath } from '../../../../core/domain/snapshot/task/computation_failed/index.js'
import {
  path as gateResultComputedPath,
  spec as gateResultComputedSpec,
} from '../../../../core/domain/edge/has_gate_state/result_computed/index.js'
import {
  path as gateComputationFailedPath,
  spec as gateComputationFailedSpec,
} from '../../../../core/domain/edge/has_gate_state/computation_failed/index.js'
import { createRouteMessage, invokeRoute } from '../../../util/invokeRoute.js'

const noop = () => {}

function diagnostics() {
  return createDiagnostics({
    logger: { info: noop, warn: noop, error: noop, debug: noop },
    metrics: { timing: noop, count: noop },
    sample: () => true,
    rateLimit: () => true,
  })
}

const resultPathByType = Object.freeze({
  data: dataSnapshotResultPath,
  gate: gateSnapshotResultPath,
  task: taskSnapshotResultPath,
})

const failurePathByType = Object.freeze({
  data: dataSnapshotFailurePath,
  gate: gateSnapshotFailurePath,
  task: taskSnapshotFailurePath,
})

function resultPayload(type, result = { value: 42 }) {
  const name = `${type}Source`
  const resultKey = `${type}.${name}`
  return {
    instanceId: 'source-instance',
    instanceVertexId: 'source-instance-vertex',
    componentStateId: 'source-component-state',
    stateMachineId: 'source-state-machine',
    stateEdgeId: 'source-state-edge',
    ...(type === 'gate' ? { gateInstanceRefId: 'source-gate-ref' } : {}),
    type,
    name,
    delta: {
      [resultKey]: result,
      [`${resultKey}.state`]: 'provided',
    },
    status: 'provided',
    stateEdgeStatus: 'provided',
    updatedAt: '2026-07-20T12:00:00.000Z',
  }
}

function failurePayload(type, overrides = {}) {
  const name = `${type}Source`
  return {
    instanceId: 'source-instance',
    instanceVertexId: 'source-instance-vertex',
    componentStateId: 'source-component-state',
    stateMachineId: 'source-state-machine',
    stateEdgeId: 'source-state-edge',
    ...(type === 'gate' ? { gateInstanceRefId: 'source-gate-ref' } : {}),
    type,
    name,
    delta: { [`${type}.${name}.state`]: 'error' },
    status: 'error',
    stateEdgeStatus: 'error',
    error: { name: 'Error', message: `${type} failed`, code: 'COMPUTE_FAILED' },
    updatedAt: '2026-07-20T12:00:00.000Z',
    ...overrides,
  }
}

function gateResultFact(overrides = {}) {
  return {
    instanceId: 'source-instance',
    instanceVertexId: 'source-instance-vertex',
    stateMachineId: 'source-state-machine',
    stateEdgeId: 'source-state-edge',
    gateInstanceRefId: 'source-gate-ref',
    type: 'gate',
    name: 'gateSource',
    result: true,
    resultValue: 'true',
    status: 'provided',
    stateEdgeStatus: 'provided',
    updatedAt: '2026-07-20T12:00:00.000Z',
    ...overrides,
  }
}

function gateFailureFact(overrides = {}) {
  return {
    instanceId: 'source-instance',
    instanceVertexId: 'source-instance-vertex',
    stateMachineId: 'source-state-machine',
    stateEdgeId: 'source-state-edge',
    gateInstanceRefId: 'source-gate-ref',
    type: 'gate',
    name: 'gateSource',
    status: 'error',
    stateEdgeStatus: 'error',
    error: { name: 'Error', message: 'gate failed' },
    updatedAt: '2026-07-20T12:00:00.000Z',
    ...overrides,
  }
}

const injectResultsSubject = createSubject(
  natsEvents['*'].component_service['*']['*'].cmd.componentInstance.injectResults.v1['*'],
)
  .forPublish()
  .env('prod')
  .build()

const startDependantsSubject = createSubject(
  natsEvents['*'].component_service['*']['*'].cmd.componentInstance.start_dependants.v1['*'],
)
  .forPublish()
  .env('prod')
  .build()

const checkStateMachineCompletionSubject = createSubject(
  natsEvents['*'].component_service['*']['*'].cmd.componentInstance.check_state_machine_completion.v1['*'],
)
  .forPublish()
  .env('prod')
  .build()

async function assertDiagnosticRejects({ path, data }) {
  const routeDiagnostics = diagnostics()
  await assert.rejects(
    invokeRoute({ diagnostics: routeDiagnostics, dataMapper: {} }, { path, data }),
    routeDiagnostics.DiagnosticError,
  )
}

test('gate result fact does not publish completion-check commands directly', () => {
  assert.equal(
    Object.hasOwn(gateResultComputedSpec.context.emits, 'component_service.cmd.componentInstance.check_state_machine_completion.v1'),
    false,
  )
})

test('gate computation_failed fact has no emitted continuations', () => {
  assert.deepEqual(gateComputationFailedSpec.context.emits, {})
})

test('data/gate/task snapshot continuations are bound to delta context', () => {
  assert.equal(dataSnapshotResultPath.context, 'delta')
  assert.equal(gateSnapshotResultPath.context, 'delta')
  assert.equal(taskSnapshotResultPath.context, 'delta')
})

for (const type of ['data', 'task']) {
  test(`${type} snapshot result publishes snapshot continuations in order, then ACKs`, async () => {
    const data = resultPayload(type, type === 'data' ? null : { value: 42 })
    const order = []
    const message = createRouteMessage({ data, ack: () => order.push('ack') })

    await invokeRoute({ diagnostics: diagnostics(), dataMapper: {} }, {
      path: resultPathByType[type],
      data,
      message,
      natsContext: {
        publish: async (subject, body) => {
          order.push({ subject, data: JSON.parse(body).data })
        },
      },
    })

    assert.equal(order.at(-1), 'ack')
    assert.equal(order.length, 4)
    assert.deepEqual(order[0], {
      subject: injectResultsSubject,
      data: {
        instanceId: data.instanceId,
        instanceVertexId: data.instanceVertexId,
        stateMachineId: data.stateMachineId,
        stateEdgeId: data.stateEdgeId,
        type,
        result: data.delta[`${type}.${data.name}`],
        updatedAt: data.updatedAt,
      },
    })
    assert.deepEqual(order[1], {
      subject: startDependantsSubject,
      data: {
        instanceId: data.instanceId,
        stateEdgeId: data.stateEdgeId,
        type,
      },
    })
    assert.deepEqual(order[2], {
      subject: checkStateMachineCompletionSubject,
      data: {
        instanceId: data.instanceId,
        instanceVertexId: data.instanceVertexId,
        stateMachineId: data.stateMachineId,
        stateEdgeId: data.stateEdgeId,
        stateEdgeStatus: 'provided',
        status: 'provided',
        type,
        result: data.delta[`${type}.${data.name}`],
        resultValue: data.delta[`${type}.${data.name}`] != null
          ? JSON.stringify(data.delta[`${type}.${data.name}`])
          : '',
      },
    })
  })
}

test('gate snapshot result publishes the completion check with its unchanged native result, then ACKs', async () => {
  const data = resultPayload('gate', false)
  const order = []
  const message = createRouteMessage({ data, ack: () => order.push('ack') })

  await invokeRoute({ diagnostics: diagnostics(), dataMapper: {} }, {
    path: gateSnapshotResultPath,
    data,
    message,
    natsContext: {
      publish: async (subject, body) => {
        order.push({ subject, data: JSON.parse(body).data })
      },
    },
  })

  assert.deepEqual(order, [
    {
      subject: checkStateMachineCompletionSubject,
      data: {
        instanceId: data.instanceId,
        instanceVertexId: data.instanceVertexId,
        stateMachineId: data.stateMachineId,
        stateEdgeId: data.stateEdgeId,
        gateInstanceRefId: data.gateInstanceRefId,
        stateEdgeStatus: 'provided',
        status: 'provided',
        type: 'gate',
        result: false,
        resultValue: 'false',
      },
    },
    'ack',
  ])
})

for (const type of ['data', 'gate', 'task']) {
  test(`${type} snapshot computation_failed only ACKs`, async () => {
    const data = failurePayload(type)
    const published = []
    const message = createRouteMessage({ data })

    await invokeRoute({ diagnostics: diagnostics(), dataMapper: {} }, {
      path: failurePathByType[type],
      data,
      message,
      natsContext: {
        publish: async (subject, body) => published.push({ subject, data: JSON.parse(body).data }),
      },
    })

    assert.deepEqual(published, [])
    assert.equal(message.acked, true)
  })
}

test('gate computation_failed fact only ACKs and does not start a child', async () => {
  const data = gateFailureFact()
  const published = []
  const message = createRouteMessage({ data })

  await invokeRoute({ diagnostics: diagnostics(), dataMapper: {} }, {
    path: gateComputationFailedPath,
    data,
    message,
    natsContext: {
      publish: async (subject, body) => published.push({ subject, data: JSON.parse(body).data }),
    },
  })

  assert.deepEqual(published, [])
  assert.equal(message.acked, true)
})

test('gate result_computed rejects a computation_failed fact', async () => {
  await assertDiagnosticRejects({
    path: gateResultComputedPath,
    data: gateFailureFact(),
  })
})

test('gate computation_failed rejects a result_computed fact', async () => {
  await assertDiagnosticRejects({
    path: gateComputationFailedPath,
    data: gateResultFact(),
  })
})

for (const field of ['status', 'stateEdgeStatus']) {
  test(`gate result fact rejects a missing ${field}`, async () => {
    const data = gateResultFact({ [field]: undefined })
    await assertDiagnosticRejects({ path: gateResultComputedPath, data })
  })

  test(`gate computation_failed fact rejects a missing ${field}`, async () => {
    const data = gateFailureFact({ [field]: undefined })
    await assertDiagnosticRejects({ path: gateComputationFailedPath, data })
  })
}

for (const error of [
  undefined,
  null,
  'failed',
  {},
  { message: 'failed' },
  { name: 'Error' },
  { name: 'Error', message: 'failed', code: {} },
]) {
  test(`gate computation_failed fact rejects malformed error metadata: ${JSON.stringify(error)}`, async () => {
    const data = gateFailureFact({ error })
    await assertDiagnosticRejects({ path: gateComputationFailedPath, data })
  })
}

for (const resultFields of [
  { result: false },
  { resultValue: 'false' },
]) {
  test(`gate computation_failed fact rejects result fields: ${JSON.stringify(resultFields)}`, async () => {
    const data = gateFailureFact(resultFields)
    await assertDiagnosticRejects({ path: gateComputationFailedPath, data })
  })
}

test('snapshot result does not ACK an injection command publish failure', async () => {
  const data = resultPayload('task')
  const failure = new Error('publish failed')
  const message = createRouteMessage({ data })
  const routeDiagnostics = diagnostics()

  await assert.rejects(
    invokeRoute({ diagnostics: routeDiagnostics, dataMapper: {} }, {
      path: taskSnapshotResultPath,
      data,
      message,
      natsContext: { publish: async () => { throw failure } },
    }),
    (error) => (
      error instanceof routeDiagnostics.DiagnosticError
      && error.code === ROUTER_HANDLER_ERROR
      && error.meta?.error === failure
    ),
  )
  assert.equal(message.acked, false)
})

test('snapshot result does not ACK when start_dependants publish fails', async () => {
  const data = resultPayload('task')
  const failure = new Error('publish failed')
  const message = createRouteMessage({ data })
  const subjects = []

  await assert.rejects(
    invokeRoute({ diagnostics: diagnostics(), dataMapper: {} }, {
      path: taskSnapshotResultPath,
      data,
      message,
      natsContext: {
        publish: async (subject) => {
          subjects.push(subject)
          if (subject === startDependantsSubject) throw failure
        },
      },
    }),
  )
  assert.deepEqual(subjects, [injectResultsSubject, startDependantsSubject])
  assert.equal(message.acked, false)
})

test('gate snapshot result does not ACK a completion-check publish failure', async () => {
  const data = resultPayload('gate')
  const failure = new Error('publish failed')
  const message = createRouteMessage({ data })
  const routeDiagnostics = diagnostics()

  await assert.rejects(
    invokeRoute({ diagnostics: routeDiagnostics, dataMapper: {} }, {
      path: gateSnapshotResultPath,
      data,
      message,
      natsContext: { publish: async () => { throw failure } },
    }),
    (error) => (
      error instanceof routeDiagnostics.DiagnosticError
      && error.code === ROUTER_HANDLER_ERROR
      && error.meta?.error === failure
    ),
  )
  assert.equal(message.acked, false)
})

for (const field of [
  'instanceId',
  'instanceVertexId',
  'componentStateId',
  'stateMachineId',
  'stateEdgeId',
  'name',
  'updatedAt',
]) {
  test(`snapshot result rejects a missing ${field}`, async () => {
    const data = { ...resultPayload('data'), [field]: '' }
    await assertDiagnosticRejects({ path: dataSnapshotResultPath, data })
  })

  test(`snapshot computation_failed rejects a missing ${field}`, async () => {
    const data = failurePayload('data', { [field]: '' })
    await assertDiagnosticRejects({ path: dataSnapshotFailurePath, data })
  })
}

test('gate snapshot result rejects a missing gateInstanceRefId', async () => {
  const data = { ...resultPayload('gate'), gateInstanceRefId: '' }

  await assertDiagnosticRejects({ path: gateSnapshotResultPath, data })
})

test('gate snapshot computation_failed rejects a missing gateInstanceRefId', async () => {
  const data = failurePayload('gate', { gateInstanceRefId: '' })

  await assertDiagnosticRejects({ path: gateSnapshotFailurePath, data })
})

test('snapshot result rejects a mismatched route type', async () => {
  const data = { ...resultPayload('task'), type: 'data' }

  await assertDiagnosticRejects({ path: taskSnapshotResultPath, data })
})

test('snapshot result rejects a non-canonical timestamp', async () => {
  for (const updatedAt of ['not-a-date', '2026-07-20']) {
    const data = { ...resultPayload('task'), updatedAt }
    await assertDiagnosticRejects({ path: taskSnapshotResultPath, data })
  }
})

for (const delta of [null, {}, { 'task.other': 42 }]) {
  test(`snapshot result rejects an unusable delta: ${JSON.stringify(delta)}`, async () => {
    const data = { ...resultPayload('task'), delta }

    await assertDiagnosticRejects({ path: taskSnapshotResultPath, data })
  })
}

for (const mutation of [
  { status: undefined },
  { stateEdgeStatus: undefined },
  { status: 'running', stateEdgeStatus: 'running' },
  { status: 'provided', stateEdgeStatus: 'error' },
  { delta: { 'task.taskSource': 42, 'task.taskSource.state': 'error' } },
]) {
  test(`snapshot result rejects inconsistent status: ${JSON.stringify(mutation)}`, async () => {
    const data = { ...resultPayload('task', 42), ...mutation }

    await assertDiagnosticRejects({ path: taskSnapshotResultPath, data })
  })
}

for (const error of [
  undefined,
  null,
  'failed',
  {},
  { message: 'failed' },
  { name: 'Error' },
  { name: 'Error', message: 'failed', code: {} },
]) {
  test(`snapshot computation_failed rejects malformed error metadata: ${JSON.stringify(error)}`, async () => {
    const data = failurePayload('data', { error })
    await assertDiagnosticRejects({ path: dataSnapshotFailurePath, data })
  })
}

test('snapshot computation_failed rejects a result delta', async () => {
  const data = failurePayload('data')
  data.delta['data.dataSource'] = 'unexpected'
  await assertDiagnosticRejects({ path: dataSnapshotFailurePath, data })
})

for (const resultField of [
  { result: null },
  { resultValue: '' },
]) {
  test(`snapshot computation_failed rejects result fields: ${JSON.stringify(resultField)}`, async () => {
    const data = failurePayload('task', resultField)
    await assertDiagnosticRejects({ path: taskSnapshotFailurePath, data })
  })
}

test('snapshot result rejects a computation_failed payload', async () => {
  await assertDiagnosticRejects({
    path: dataSnapshotResultPath,
    data: failurePayload('data'),
  })
})

test('snapshot computation_failed rejects a result payload', async () => {
  await assertDiagnosticRejects({
    path: dataSnapshotFailurePath,
    data: resultPayload('data'),
  })
})
