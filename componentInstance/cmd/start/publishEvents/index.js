import { componentInstanceStarted } from './componentInstanceStarted.js'
import { startDataStates } from './startDataStates.js'
import { startImports } from './startImports.js'
import { startTaskStates } from './startTaskStates.js'
import { startServiceStates } from './startServiceStates.js'

export async function publishEvents(args) {
  await Promise.all([
    startDataStates(args),
    startTaskStates(args),
    startServiceStates(args),
    startImports(args),
    componentInstanceStarted(args),
  ])
}
