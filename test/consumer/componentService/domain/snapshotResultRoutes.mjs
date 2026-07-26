import test from 'node:test'
import assert from 'node:assert/strict'
import { diagnostics as createDiagnostics } from '@liquid-bricks/lib-diagnostics'
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

import { path as dataSnapshotResultPath } from '../../../../core/domain/snapshot/data/result/index.js'
import { path as gateSnapshotResultPath } from '../../../../core/domain/snapshot/gate/result/index.js'
import { path as taskSnapshotResultPath } from '../../../../core/domain/snapshot/task/result/index.js'
import { spec as gateResultComputedSpec } from '../../../../core/domain/edge/has_gate_state/result_computed/index.js'
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

const pathByType = Object.freeze({
  data: dataSnapshotResultPath,
  gate: gateSnapshotResultPath,
  task: taskSnapshotResultPath,
})

function payload(type, result = { value: 42 }) {
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
    delta: { [`${type}.${name}`]: result },
    updatedAt: '2026-07-20T12:00:00.000Z',
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

test('data/gate/task snapshot continuations are bound to delta context', () => {
  assert.equal(dataSnapshotResultPath.context, 'delta')
  assert.equal(gateSnapshotResultPath.context, 'delta')
  assert.equal(taskSnapshotResultPath.context, 'delta')
})

for (const type of ['data', 'task']) {
  test(`${type} snapshot result publishes snapshot continuations in order, then ACKs`, async () => {
    const data = payload(type, type === 'data' ? null : { value: 42 })
    const order = []
    const message = createRouteMessage({ data, ack: () => order.push('ack') })

    await invokeRoute({ diagnostics: diagnostics(), dataMapper: {} }, {
      path: pathByType[type],
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
  const data = payload('gate', false)
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
        type: 'gate',
        result: false,
        resultValue: 'false',
      },
    },
    'ack',
  ])
})

test('snapshot result does not ACK an injection command publish failure', async () => {
  const data = payload('task')
  const failure = new Error('publish failed')
  const message = createRouteMessage({ data })

  await assert.rejects(
    invokeRoute({ diagnostics: diagnostics(), dataMapper: {} }, {
      path: taskSnapshotResultPath,
      data,
      message,
      natsContext: { publish: async () => { throw failure } },
    }),
    (error) => error === failure,
  )
  assert.equal(message.acked, false)
})

test('snapshot result does not ACK when start_dependants publish fails', async () => {
  const data = payload('task')
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
  const data = payload('gate')
  const failure = new Error('publish failed')
  const message = createRouteMessage({ data })

  await assert.rejects(
    invokeRoute({ diagnostics: diagnostics(), dataMapper: {} }, {
      path: gateSnapshotResultPath,
      data,
      message,
      natsContext: { publish: async () => { throw failure } },
    }),
    (error) => error === failure,
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
    const data = { ...payload('data'), [field]: '' }
    await assertDiagnosticRejects({ path: dataSnapshotResultPath, data })
  })
}

test('gate snapshot result rejects a missing gateInstanceRefId', async () => {
  const data = { ...payload('gate'), gateInstanceRefId: '' }

  await assertDiagnosticRejects({ path: gateSnapshotResultPath, data })
})

test('snapshot result rejects a mismatched route type', async () => {
  const data = { ...payload('task'), type: 'data' }

  await assertDiagnosticRejects({ path: taskSnapshotResultPath, data })
})

test('snapshot result rejects a non-canonical timestamp', async () => {
  for (const updatedAt of ['not-a-date', '2026-07-20']) {
    const data = { ...payload('task'), updatedAt }
    await assertDiagnosticRejects({ path: taskSnapshotResultPath, data })
  }
})

for (const delta of [null, {}, { 'task.other': 42 }]) {
  test(`snapshot result rejects an unusable delta: ${JSON.stringify(delta)}`, async () => {
    const data = { ...payload('task'), delta }

    await assertDiagnosticRejects({ path: taskSnapshotResultPath, data })
  })
}
