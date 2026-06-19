import { completeStateMachineIfFinished } from './completeStateMachineIfFinished.js'
import { publishGateStartIfPassed } from './publishGateStartIfPassed.js'
import { publishInjectResultsCommand } from './publishInjectResultsCommand.js'
import { publishStartDependantsCommand } from './publishStartDependantsCommand.js'

export const publishEvents = [
  publishGateStartIfPassed,
  {
    completeStateMachineIfFinished,
    publishInjectResultsCommand,
    publishStartDependantsCommand,
  },
]
