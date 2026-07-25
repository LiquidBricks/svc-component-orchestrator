import { domain } from '@liquid-bricks/spec-domain/domain'
import {
  publishCheckStateMachineCompletionCommand as publishCommand,
} from '../../_helper/publishCheckStateMachineCompletionCommand.js'

const PROVIDED_STATUS_BY_TYPE = Object.freeze({
  data: domain.edge.has_data_state.stateMachine_data.constants.Status.PROVIDED,
  task: domain.edge.has_task_state.stateMachine_task.constants.Status.PROVIDED,
})

export function publishCheckStateMachineCompletionCommand(args) {
  const resultValue = args.scope.result != null
    ? JSON.stringify(args.scope.result)
    : ''
  const stateEdgeStatus = PROVIDED_STATUS_BY_TYPE[args.scope.type]
  const scope = stateEdgeStatus === undefined
    ? { ...args.scope, resultValue }
    : {
        ...args.scope,
        stateEdgeStatus,
        status: stateEdgeStatus,
        resultValue,
      }

  return publishCommand({ ...args, scope })
}
