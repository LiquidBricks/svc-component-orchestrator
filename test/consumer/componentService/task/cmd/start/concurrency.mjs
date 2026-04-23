import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'
import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { JetStreamApiCodes, JetStreamApiError } from '@nats-io/jetstream'

import { componentImports } from '../../../../../../core/componentInstance/cmd/create/loadData/componentImports.js'
import { path as taskStartPath } from '../../../../../../core/task/cmd/start/index.js'
import {
  withGraphContext,
  registerComponent,
  createInstance,
  domain,
  getRouteSpec,
} from '../../../helpers.mjs'
import { invokeRoute } from '../../../../../util/invokeRoute.js'

function createNatsContextSpy() {
  const acquiredKeys = new Set()
  const published = []

  return {
    published,
    natsContext: {
      async Kvm() {
        return {
          async create() {
            return {
              async create(key) {
                if (acquiredKeys.has(key)) {
                  throw new JetStreamApiError({
                    err_code: JetStreamApiCodes.StreamWrongLastSequence,
                    description: 'wrong last sequence',
                    code: 400,
                  })
                }

                acquiredKeys.add(key)
                return acquiredKeys.size
              },
            }
          },
        }
      },
      async publish(subject, payload) {
        published.push({ subject, payload: JSON.parse(payload) })
      },
    },
  }
}

async function getTaskStateEdgeId({ g, instanceId }) {
  const [instanceVertexId] = await g
    .V()
    .has('label', domain.vertex.componentInstance.constants.LABEL)
    .has('instanceId', instanceId)
    .id()

  const [stateMachineId] = await g
    .V(instanceVertexId)
    .out(domain.edge.has_stateMachine.componentInstance_stateMachine.constants.LABEL)
    .id()

  const [taskStateEdgeId] = await g
    .V(stateMachineId)
    .outE(domain.edge.has_task_state.stateMachine_task.constants.LABEL)
    .id()

  return taskStateEdgeId
}

test('concurrent duplicate task starts should emit only one execution request', async () => {
  const taskSpec = getRouteSpec({ channel: 'cmd', entity: 'task', action: 'start' })
  assert.equal(taskSpec.pre[0].name, 'skipIfLocked')

  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('ConcurrentTaskStartComponent')
      .task('taskA', {})
      .toJSON()

    await registerComponent({ diagnostics, dataMapper, g }, component)

    const [componentId] = await g
      .V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', component.hash)
      .id()

    const { imports } = await componentImports({ rootCtx: { g }, scope: { componentId } })

    const instanceId = 'instance-task-concurrency'
    await createInstance({ diagnostics, dataMapper, g }, {
      componentHash: component.hash,
      componentId,
      instanceId,
      imports,
    })

    const stateId = await getTaskStateEdgeId({ g, instanceId })
    const { natsContext, published } = createNatsContextSpy()

    await Promise.all([
      invokeRoute({ diagnostics, dataMapper, g }, {
        path: taskStartPath,
        data: { instanceId, stateId },
        natsContext,
      }),
      invokeRoute({ diagnostics, dataMapper, g }, {
        path: taskStartPath,
        data: { instanceId, stateId },
        natsContext,
      }),
    ])

    const executionRequestSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('component')
      .channel('exec')
      .action('compute_result')
      .version('v1')
      .build()

    const executionRequests = published.filter(({ subject }) => subject === executionRequestSubject)

    assert.equal(
      executionRequests.length,
      1,
      `expected one execution request, got ${executionRequests.length}: ${JSON.stringify(executionRequests)}`
    )
  })
})
