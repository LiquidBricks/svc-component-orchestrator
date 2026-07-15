import { componentInstanceStartDone } from './componentInstanceStartDone.js'
import { startDataStates } from './startDataStates.js'
import { startGates } from './startGates.js'
import { startImports } from './startImports.js'
import { startTaskStates } from './startTaskStates.js'

export const publishEvents = {
  startDataStates,
  startTaskStates,
  startImports,
  startGates,
  componentInstanceStartDone,
}
