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

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


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

async function getTaskStateEdgeId({ g, dataMapper, instanceId }) {
  const [instanceVertexId] = await dataMapper.query.findInstanceVertexId({ instanceId })

  const [stateMachineId] = await dataMapper.query.readStateMachineId({ vertexId: instanceVertexId })

  const [taskStateEdgeId] = await dataMapper.query.readTaskStateEdgeId({ vertexId: stateMachineId })

  return taskStateEdgeId
}

test('concurrent duplicate task starts should emit only one started fact', async () => {
  const taskSpec = getRouteSpec({ channel: 'cmd', entity: 'task', action: 'start' })
  assert.equal(taskSpec.pre[0].name, 'skipIfLocked')

  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('ConcurrentTaskStartComponent')
      .task('taskA', {})
      .toJSON()

    await registerComponent({ diagnostics, dataMapper, g }, component)

    const [componentId] = await dataMapper.query.findComponentIdByHash({ hash: component.hash })

    const { imports } = await componentImports({ rootCtx: { g, dataMapper }, scope: { componentId } })

    const instanceId = 'instance-task-concurrency'
    await createInstance({ diagnostics, dataMapper, g }, {
      componentHash: component.hash,
      componentId,
      instanceId,
      imports,
    })

    const stateId = await getTaskStateEdgeId({ g, dataMapper, instanceId })
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

    const taskStartedSubject = createBasicSubject(natsEvents['*'].domain['*']['*'].edge.has_task_state.started.v1['*']).forPublish()
      .env('prod')
      .build()

    const startedFacts = published.filter(({ subject }) => subject === taskStartedSubject)

    assert.equal(
      startedFacts.length,
      1,
      `expected one started fact, got ${startedFacts.length}: ${JSON.stringify(startedFacts)}`
    )
  })
})
