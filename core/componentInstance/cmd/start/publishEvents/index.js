import { componentInstanceStartDone } from './componentInstanceStartDone.js'
import { startDataStates } from './startDataStates.js'
import { startImports } from './startImports.js'
import { startTaskStates } from './startTaskStates.js'
import { startGates } from './startGates.js'

export const publishEvents = {
  startDataStates,
  startTaskStates,
  startImports,
  startGates,
  componentInstanceStartDone,
}
