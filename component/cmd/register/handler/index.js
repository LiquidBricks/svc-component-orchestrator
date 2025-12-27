import { createComponentVertex } from './createComponentVertex.js'
import { attachComponentImports } from './attachComponentImports.js'
import { buildDependencyList } from './buildDependencyList.js'
import { linkDataTaskDependencies } from './linkDataTaskDependencies.js'
import { linkDataTaskInjections } from './linkDataTaskInjections.js'
import { linkImportInjections } from './linkImportInjections.js'

export const handler = [
  createComponentVertex,
  attachComponentImports,
  buildDependencyList,
  linkDataTaskDependencies,
  linkDataTaskInjections,
  linkImportInjections,
]
