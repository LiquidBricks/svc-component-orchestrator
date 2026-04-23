import { createComponentVertex } from './createComponentVertex.js'
import { attachComponentImports } from './attachComponentImports.js'
import { buildDependencyList } from './buildDependencyList.js'
import { linkDataTaskDependencies } from './linkDataTaskDependencies.js'
import { linkDataTaskInjections } from './linkDataTaskInjections.js'
import { linkImportInjections } from './linkImportInjections.js'
import { attachImportWaitFor } from './attachImportWaitFor.js'
import { attachComponentGates } from './attachComponentGates.js'

export const handler = [
  createComponentVertex,
  attachComponentImports,
  buildDependencyList,
  attachImportWaitFor,
  attachComponentGates,
  linkDataTaskDependencies,
  linkDataTaskInjections,
  linkImportInjections,
]
