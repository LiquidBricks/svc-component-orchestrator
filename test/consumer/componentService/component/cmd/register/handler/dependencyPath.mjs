import test from 'node:test'
import assert from 'node:assert/strict'

import { parseDependencyPath } from '../../../../../../../core/component/cmd/register/handler/dependencyPath.js'
import { createHandlerDiagnostics, makeDiagnosticsInstance } from '../helpers.mjs'

test('dependency paths support import lifecycle.done references for waitFor', () => {
  const diagnostics = makeDiagnosticsInstance()
  const handlerDiagnostics = createHandlerDiagnostics(diagnostics)

  const parsed = parseDependencyPath({
    handlerDiagnostics,
    dep: 'controlplanepod.lifecycle.done',
    compName: 'LifecycleWaitForRoot',
    hash: 'root-hash',
    dependencyType: 'import',
    dependencyName: 'corednsStart',
  })

  assert.deepEqual(parsed, {
    trimmedDep: 'controlplanepod.lifecycle.done',
    importPath: ['controlplanepod'],
    targetType: 'lifecycle',
    targetName: 'done',
  })
})
