import { create as createBasicSubject } from '@liquid-bricks/shared-providers/subject/create/basic'

import { domain } from '@liquid-bricks/spec-domain/domain'

const PROVIDED_STATUS = domain.edge.has_data_state.stateMachine_data.constants.Status.PROVIDED
const STATE_EDGE_LABELS = [
  domain.edge.has_data_state.stateMachine_data.constants.LABEL,
  domain.edge.has_task_state.stateMachine_task.constants.LABEL,
  domain.edge.has_service_state.stateMachine_service.constants.LABEL,
]

export async function completeStateMachineIfFinished({ scope: { handlerDiagnostics, stateMachineId, instanceId }, rootCtx: { g, natsContext } }) {
  const statusMaps = await g
    .V(stateMachineId)
    .outE(...STATE_EDGE_LABELS)
    .valueMap('status')
  if (!statusMaps?.length) return

  const allProvided = statusMaps.every(map => {
    const statusMap = Array.isArray(map) ? map[0] : map
    const statusValues = statusMap?.status ?? statusMap
    const status = Array.isArray(statusValues) ? statusValues[0] : statusValues
    return status === PROVIDED_STATUS
  })
  if (!allProvided) return

  const [stateValues] = await g.V(stateMachineId).valueMap('state')
  const currentStateValues = stateValues?.state ?? stateValues
  const currentState = Array.isArray(currentStateValues) ? currentStateValues[0] : currentStateValues
  if (currentState === domain.vertex.stateMachine.constants.STATES.COMPLETE) return

  const subject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('componentInstance')
    .channel('evt')
    .action('state_machine_completed')
    .version('v1')
    .build()

  await natsContext.publish(
    subject,
    JSON.stringify({ data: { instanceId, stateMachineId } })
  )

}
