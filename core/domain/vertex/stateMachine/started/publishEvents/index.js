import { componentInstanceStartDone } from './componentInstanceStartDone.js'
import { startDataStates } from './startDataStates.js'
import { startGates } from './startGates.js'
import { startImports } from './startImports.js'
import { startProvidedStateDependants } from './startProvidedStateDependants.js'
import { startTaskStates } from './startTaskStates.js'

export const publishEvents = {
  startDataStates,
  startTaskStates,
  startProvidedStateDependants,
  startImports,
  startGates,
  componentInstanceStartDone,
}
