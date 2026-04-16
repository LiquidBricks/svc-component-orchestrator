import { completeStateMachineIfFinished } from './completeStateMachineIfFinished.js'
import { publishGateStartIfPassed } from './publishGateStartIfPassed.js'
import { publishInjectedResultComputedEvents } from './publishInjectedResultComputedEvents.js'
import { publishStartDependantsCommand } from './publishStartDependantsCommand.js'

export async function publishEvents(args) {
  const { type } = args?.scope ?? {}
  if (type === 'gate') {
    await publishGateStartIfPassed(args)
    return
  }

  await Promise.all([
    completeStateMachineIfFinished(args),
    publishInjectedResultComputedEvents(args),
    publishStartDependantsCommand(args),
  ])
}
