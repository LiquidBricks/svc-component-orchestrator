import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'
import { ackMessage, decodeData } from '../../../../../middleware/index.js'
import { completeStateMachineIfFinished } from '../_helper/completeStateMachineIfFinished.js'
import { findStateEdge } from './findStateEdge.js'
import { loadData } from '../_helper/loadData.js'
import { publishInjectResultsCommand } from './publishInjectResultsCommand.js'
import { publishStartDependantsCommand } from './publishStartDependantsCommand.js'
import { validatePayload } from '../_helper/validatePayload.js'

async function handleStateResult({
  rootCtx: { dataMapper },
  scope: { instanceId, result, stateEdgeId, stateEdgeStatus },
}) {
  const updatedAt = new Date().toISOString()
  const resultValue = result != null ? JSON.stringify(result) : ''

  await dataMapper.edge.has_task_state.stateMachine_task.updateResultStatusUpdatedAt({
    edgeId: stateEdgeId,
    result: resultValue,
    status: stateEdgeStatus,
    updatedAt,
  })

  return { instanceId }
}

export const path = createSubject(natsEvents['*'].component_service['*'].function_result.evt.component.compute_function.v1.task)
  .forSubscribe()
  .toObject()

export const spec = {
  decode: [
    decodeData(['instanceId', 'name', 'result']),
  ],
  pre: [
    validatePayload,
    loadData,
    findStateEdge,
  ],
  handler: handleStateResult,
  post: [
    {
      completeStateMachineIfFinished,
      publishInjectResultsCommand,
      publishStartDependantsCommand,
    },
    ackMessage,
  ]
}

export { getCodeLocation } from '../_helper/getCodeLocation.js'
