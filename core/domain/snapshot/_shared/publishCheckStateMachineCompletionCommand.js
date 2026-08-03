import {
  publishCheckStateMachineCompletionCommand as publishCommand,
} from '../../_helper/publishCheckStateMachineCompletionCommand.js'

export function publishCheckStateMachineCompletionCommand(args) {
  const resultValue = args.scope.result != null
    ? JSON.stringify(args.scope.result)
    : ''
  const scope = { ...args.scope, resultValue }

  return publishCommand({ ...args, scope })
}
