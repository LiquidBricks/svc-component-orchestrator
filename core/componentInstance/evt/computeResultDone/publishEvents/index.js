import { completeStateMachineIfFinished } from './completeStateMachineIfFinished.js'
import { publishGateStartIfPassed } from './publishGateStartIfPassed.js'
import { publishProcessInjectedComputeResultDoneEvent } from './publishProcessInjectedComputeResultDoneEvent.js'
import { publishStartDependantsCommand } from './publishStartDependantsCommand.js'

export async function publishEvents(args) {
  const { type } = args?.scope ?? {}
  if (type === 'gate') {
    await publishGateStartIfPassed(args)
    await completeStateMachineIfFinished(args)
    return
  }

  await Promise.all([
    completeStateMachineIfFinished(args),
    publishProcessInjectedComputeResultDoneEvent(args),
    publishStartDependantsCommand(args),
  ])
}
