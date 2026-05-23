import { componentInstanceStartDone } from './componentInstanceStartDone.js'
import { startDataStates } from './startDataStates.js'
import { startImports } from './startImports.js'
import { startTaskStates } from './startTaskStates.js'
import { startGates } from './startGates.js'

export async function publishEvents(args) {
  await Promise.all([
    startDataStates(args),
    startTaskStates(args),
    startImports(args),
    startGates(args),
    componentInstanceStartDone(args),
  ])
}
