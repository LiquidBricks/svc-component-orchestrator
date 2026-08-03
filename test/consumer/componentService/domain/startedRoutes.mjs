import test from 'node:test'
import assert from 'node:assert/strict'
import { diagnostics as createDiagnostics } from '@liquid-bricks/lib-diagnostics'
import { ROUTER_HANDLER_ERROR } from '@liquid-bricks/lib-diagnostics/codes'
import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

import { path as dataStartedPath } from '../../../../core/domain/edge/has_data_state/started/index.js'
import { path as taskStartedPath } from '../../../../core/domain/edge/has_task_state/started/index.js'
import { path as injectedPath } from '../../../../core/domain/edge/injects_into/injected/index.js'
import { path as stateMachineStartedPath } from '../../../../core/domain/vertex/stateMachine/started/index.js'
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

const edgePayload = (type) => ({
  instanceId: 'instance-1',
  instanceVertexId: 'instance-v-1',
  stateMachineId: 'machine-1',
  stateEdgeId: `${type}-edge-1`,
  stateId: `${type}-edge-1`,
  nodeId: `${type}-node-1`,
  componentHash: 'component-hash',
  name: `${type}-name`,
  deps: {},
  type,
  status: 'running',
  stateEdgeStatus: 'running',
  updatedAt: '2026-07-15T12:00:00.000Z',
})

const stateMachinePayload = {
  instanceId: 'instance-1',
  instanceVertexId: 'instance-v-1',
  stateMachineId: 'machine-1',
  state: 'running',
  dataStateIds: ['data-edge-1'],
  taskStateIds: ['task-edge-1'],
  importInstanceIds: ['import-instance-1'],
  gateInstanceIds: ['gate-instance-1'],
  updatedAt: '2026-07-15T12:00:00.000Z',
}

const injectedPayload = {
  instanceId: 'source-instance',
  instanceVertexId: 'source-instance-vertex',
  stateMachineId: 'source-state-machine',
  stateEdgeId: 'source-state-edge',
  type: 'task',
  result: { value: 42 },
  updatedAt: '2026-07-15T12:00:00.000Z',
}

async function assertPublishesBeforeAck({ path, data }) {
  const order = []
  const message = createRouteMessage({ data, ack: () => order.push('ack') })
  await invokeRoute({ diagnostics: diagnostics(), dataMapper: {} }, {
    path,
    data,
    message,
    natsContext: {
      publish: async (subject) => order.push(subject),
    },
  })

  assert.ok(order.length > 1)
  assert.equal(order.at(-1), 'ack')
}

async function assertPublishFailureIsNotAcked({ path, data }) {
  let acked = false
  const message = createRouteMessage({ data, ack: () => { acked = true } })
  await assert.rejects(
    invokeRoute({ diagnostics: diagnostics(), dataMapper: {} }, {
      path,
      data,
      message,
      natsContext: {
        publish: async () => {
          throw new Error('publish failed')
        },
      },
    }),
  )
  assert.equal(acked, false)
}

test('data started reaction validates, publishes, then ACKs', async () => {
  await assertPublishesBeforeAck({ path: dataStartedPath, data: edgePayload('data') })
})

test('data started reaction does not ACK a publish failure', async () => {
  await assertPublishFailureIsNotAcked({ path: dataStartedPath, data: edgePayload('data') })
})

test('task started reaction validates, publishes, then ACKs', async () => {
  await assertPublishesBeforeAck({ path: taskStartedPath, data: edgePayload('task') })
})

test('task started reaction does not ACK a publish failure', async () => {
  await assertPublishFailureIsNotAcked({ path: taskStartedPath, data: edgePayload('task') })
})

test('stateMachine started reaction maps child ids, publishes fanout, then ACKs', async () => {
  await assertPublishesBeforeAck({ path: stateMachineStartedPath, data: stateMachinePayload })
})

test('stateMachine started reaction does not ACK a fanout failure', async () => {
  await assertPublishFailureIsNotAcked({ path: stateMachineStartedPath, data: stateMachinePayload })
})

test('injects_into injected reaction resolves targets, publishes, then ACKs', async () => {
  const lookups = []
  const order = []
  const dataMapper = {
    vertex: {
      componentInstance: {
        index: {
          injectionRouting: {
            lookup: async (input) => {
              lookups.push(input)
              return {
                targets: [{
                  instanceId: 'target-instance',
                  stateEdgeId: 'target-state-edge',
                  name: 'targetData',
                  type: 'data',
                }],
              }
            },
          },
        },
      },
    },
  }
  const message = createRouteMessage({ data: injectedPayload, ack: () => order.push('ack') })

  await invokeRoute({ diagnostics: diagnostics(), dataMapper }, {
    path: injectedPath,
    data: injectedPayload,
    message,
    natsContext: {
      publish: async (subject, payload) => order.push({ subject, payload: JSON.parse(payload) }),
    },
  })

  assert.deepEqual(lookups, [{
    instanceId: 'source-instance',
    instanceVertexId: 'source-instance-vertex',
    stateMachineId: 'source-state-machine',
    stateEdgeId: 'source-state-edge',
    type: 'task',
  }])
  assert.equal(order.at(-1), 'ack')
  const [event] = order
  assert.equal(
    event.subject,
    createBasicSubject(
      natsEvents['*'].component_service['*'].function_result.evt.component.compute_function.v1.data,
    )
      .forPublish()
      .env('prod')
      .build(),
  )
  assert.deepEqual(event.payload, {
    data: {
      instanceId: 'target-instance',
      stateId: 'target-state-edge',
      name: 'targetData',
      type: 'data',
      result: injectedPayload.result,
      status: 'provided',
    },
  })
})

test('injects_into injected reaction does not ACK a routing failure', async () => {
  const failure = new Error('index missing')
  let acked = false
  const dataMapper = {
    vertex: {
      componentInstance: {
        index: {
          injectionRouting: {
            lookup: async () => { throw failure },
          },
        },
      },
    },
  }
  const message = createRouteMessage({ data: injectedPayload, ack: () => { acked = true } })
  const routeDiagnostics = diagnostics()

  await assert.rejects(
    invokeRoute({ diagnostics: routeDiagnostics, dataMapper }, {
      path: injectedPath,
      data: injectedPayload,
      message,
      natsContext: { publish: async () => {} },
    }),
    (error) => (
      error instanceof routeDiagnostics.DiagnosticError
      && error.code === ROUTER_HANDLER_ERROR
      && error.meta?.error === failure
    ),
  )
  assert.equal(acked, false)
})

test('injects_into injected reaction rejects a fact without a native result', async () => {
  const data = { ...injectedPayload }
  Reflect.deleteProperty(data, 'result')
  const routeDiagnostics = diagnostics()

  await assert.rejects(
    invokeRoute({ diagnostics: routeDiagnostics, dataMapper: {} }, {
      path: injectedPath,
      data,
    }),
    routeDiagnostics.DiagnosticError,
  )
})

test('injects_into injected reaction rejects a non-canonical timestamp', async () => {
  for (const updatedAt of ['not-a-date', '2026-07-20']) {
    const data = { ...injectedPayload, updatedAt }
    const routeDiagnostics = diagnostics()

    await assert.rejects(
      invokeRoute({ diagnostics: routeDiagnostics, dataMapper: {} }, {
        path: injectedPath,
        data,
      }),
      routeDiagnostics.DiagnosticError,
    )
  }
})
