import test from 'node:test'
import assert from 'node:assert/strict'
import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

import { spec as injectResultsSpec } from '../../../../../../../core/componentInstance/cmd/injectResults/index.js'
import { publishInjectedComputeResultDoneEvents } from '../../../../../../../core/componentInstance/cmd/injectResults/publishEvents/publishInjectedComputeResultDoneEvents.js'

function dataMapperWithLookup(lookup) {
  return {
    vertex: {
      componentInstance: {
        index: {
          injectionRouting: { lookup },
        },
      },
    },
  }
}

test('publishInjectedComputeResultDoneEvents publishes only indexed targets', async () => {
  const lookups = []
  const published = []
  const result = { value: 42 }
  const dataMapper = dataMapperWithLookup(async (input) => {
    lookups.push(input)
    return {
      targets: [{
        instanceId: 'target-instance',
        stateEdgeId: 'target-state-edge',
        name: 'targetData',
        type: 'data',
      }],
    }
  })

  await publishInjectedComputeResultDoneEvents({
    rootCtx: {
      dataMapper,
      natsContext: {
        publish: async (subject, payload) => published.push({
          subject,
          payload: JSON.parse(payload),
        }),
      },
    },
    routeCtx: injectResultsSpec.context,
    scope: {
      instanceId: 'source-instance',
      instanceVertexId: 'source-instance-vertex',
      stateMachineId: 'source-state-machine',
      stateEdgeId: 'source-state-edge',
      type: 'task',
      result,
    },
  })

  assert.deepEqual(lookups, [{
    instanceId: 'source-instance',
    instanceVertexId: 'source-instance-vertex',
    stateMachineId: 'source-state-machine',
    stateEdgeId: 'source-state-edge',
    type: 'task',
  }])
  assert.deepEqual(published, [{
    subject: createBasicSubject(
      injectResultsSpec.context.emits['component_service.function_result.evt.component.compute_function.v1.data'],
    )
      .forPublish()
      .env('prod')
      .build(),
    payload: {
      data: {
        instanceId: 'target-instance',
        stateId: 'target-state-edge',
        name: 'targetData',
        type: 'data',
        result,
      },
    },
  }])
})

test('publishInjectedComputeResultDoneEvents propagates index lookup failures', async () => {
  const failure = new Error('index missing')
  const published = []
  const dataMapper = dataMapperWithLookup(async () => { throw failure })

  await assert.rejects(
    publishInjectedComputeResultDoneEvents({
      rootCtx: {
        dataMapper,
        natsContext: {
          publish: async (...args) => published.push(args),
        },
      },
      routeCtx: injectResultsSpec.context,
      scope: {
        instanceId: 'source-instance',
        instanceVertexId: 'source-instance-vertex',
        stateMachineId: 'source-state-machine',
        stateEdgeId: 'source-state-edge',
        type: 'task',
        result: {},
      },
    }),
    (error) => error === failure,
  )
  assert.deepEqual(published, [])
})
