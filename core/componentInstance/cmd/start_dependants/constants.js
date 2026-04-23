import { domain } from '@liquid-bricks/spec-domain/domain'

export const STATE_EDGE_LABEL_BY_TYPE = Object.freeze({
  data: domain.edge.has_data_state.stateMachine_data.constants.LABEL,
  task: domain.edge.has_task_state.stateMachine_task.constants.LABEL,
})

export const STATE_WAITING_STATUS_BY_TYPE = Object.freeze({
  data: domain.edge.has_data_state.stateMachine_data.constants.Status.WAITING,
  task: domain.edge.has_task_state.stateMachine_task.constants.Status.WAITING,
})

export const PROVIDED_STATUS = domain.edge.has_task_state.stateMachine_task.constants.Status.PROVIDED
