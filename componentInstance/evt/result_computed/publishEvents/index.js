import { completeStateMachineIfFinished } from './completeStateMachineIfFinished.js'
import { publishInjectedResultComputedEvents } from './publishInjectedResultComputedEvents.js'
import { publishStartDependantsCommand } from './publishStartDependantsCommand.js'

export async function publishEvents(args) {
  await Promise.all([
    completeStateMachineIfFinished(args),
    publishInjectedResultComputedEvents(args),
    publishStartDependantsCommand(args),
  ])
}
