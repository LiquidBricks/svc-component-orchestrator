import { domain } from '@liquid-bricks/spec-domain/domain'

export const STATE_EDGE_LABEL_BY_TYPE = Object.freeze({
  data: domain.edge.has_data_state.stateMachine_data.constants.LABEL,
  task: domain.edge.has_task_state.stateMachine_task.constants.LABEL,
  service: domain.edge.has_service_state.stateMachine_service.constants.LABEL,
})

export const STATE_EDGE_STATUS_BY_TYPE = Object.freeze({
  data: domain.edge.has_data_state.stateMachine_data.constants.Status.PROVIDED,
  task: domain.edge.has_task_state.stateMachine_task.constants.Status.PROVIDED,
  service: domain.edge.has_service_state.stateMachine_service.constants.Status.PROVIDED,
})
