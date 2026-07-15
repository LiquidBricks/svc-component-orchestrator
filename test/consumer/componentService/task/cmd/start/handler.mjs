import test from 'node:test'
import assert from 'node:assert/strict'

import { handler } from '../../../../../../core/task/cmd/start/handler.js'
import { spec } from '../../../../../../core/task/cmd/start/index.js'
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

test('handler publishes the task-state started fact', async () => {
  const published = []
  await handler({
    rootCtx: {
      dataMapper: { query: { readTaskStateStatus: async () => [{ status: 'waiting' }] } },
      natsContext: {
        publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }),
      },
    },
    routeCtx: spec.context,
    scope: {
      instanceId: 'instance-1',
      stateId: 'state-task-1',
      instanceVertexId: 'instance-v-1',
      stateMachineId: 'machine-1',
      taskNodeId: 'task-1',
      componentHash: 'hash-1',
      name: 'build',
      deps: {},
      handlerDiagnostics: { require: (condition) => assert.ok(condition) },
    },
  })

  const expectedSubject = createSubject(
    natsEvents['*'].domain['*']['*'].edge.has_task_state.started.v1['*'],
  ).forPublish().env('prod').build()
  assert.equal(published.length, 1)
  assert.equal(published[0].subject, expectedSubject)
  assert.deepEqual(published[0].payload.data, {
    instanceId: 'instance-1',
    instanceVertexId: 'instance-v-1',
    stateMachineId: 'machine-1',
    stateEdgeId: 'state-task-1',
    stateId: 'state-task-1',
    nodeId: 'task-1',
    componentHash: 'hash-1',
    name: 'build',
    deps: {},
    type: 'task',
    status: 'running',
    stateEdgeStatus: 'running',
    updatedAt: published[0].payload.data.updatedAt,
  })
  assert.ok(!Number.isNaN(Date.parse(published[0].payload.data.updatedAt)))
})
