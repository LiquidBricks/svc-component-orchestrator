import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'
import { ackMessage, decodeData } from '../../../../../middleware/index.js'
import { findStateEdge } from './findStateEdge.js'
import { loadData } from '../_helper/loadData.js'
import { validatePayload } from '../_helper/validatePayload.js'

async function publishResultComputedFact({
  scope: {
    instanceId,
    instanceVertexId,
    name,
    result,
    stateMachineId,
    stateEdgeId,
    stateEdgeStatus,
  },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  const updatedAt = new Date().toISOString()
  const resultValue = result != null ? JSON.stringify(result) : ''

  await natsContext.publish(
    createSubject(emits['domain.edge.has_task_state.result_computed.v1'])
      .forPublish()
      .env('prod')
      .build(),
    JSON.stringify({
      data: {
        instanceId,
        instanceVertexId,
        stateMachineId,
        stateEdgeId,
        stateId: stateEdgeId,
        type: 'task',
        name,
        result,
        resultValue,
        status: stateEdgeStatus,
        stateEdgeStatus,
        updatedAt,
      },
    }),
  )

  return { instanceId, stateEdgeId, status: stateEdgeStatus, updatedAt }
}


export const path = createSubject(natsEvents['*'].component_service['*'].function_result.evt.component.compute_function.v1.task)
  .forSubscribe()
  .toObject()

export const emits = {
  'domain.edge.has_task_state.result_computed.v1':
    natsEvents['*'].domain['*']['*'].edge.has_task_state.result_computed.v1['*'],
}

export const spec = {
  context: { emits },
  decode: [
    decodeData(['instanceId', 'name', 'result']),
  ],
  pre: [
    validatePayload,
    loadData,
    findStateEdge,
  ],
  handler: publishResultComputedFact,
  post: [
    ackMessage,
  ]
}

export { getCodeLocation } from '../_helper/getCodeLocation.js'
