import test from 'node:test'
import assert from 'node:assert/strict'

import { parseDependencyPath } from '../../../../../../../core/componentAgent/cmd/registerComponent/handler/dependencyPath.js'
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

test('dependency paths support local agentFn references', () => {
  const diagnostics = makeDiagnosticsInstance()
  const handlerDiagnostics = createHandlerDiagnostics(diagnostics)

  const parsed = parseDependencyPath({
    handlerDiagnostics,
    dep: 'agentFn.runCommand',
    compName: 'AgentFnRoot',
    hash: 'root-hash',
    dependencyType: 'task',
    dependencyName: 'bootstrap',
  })

  assert.deepEqual(parsed, {
    trimmedDep: 'agentFn.runCommand',
    importPath: [],
    targetType: 'agentFn',
    targetName: 'runCommand',
  })
})

test('router completion is public while route internals are private', async () => {
  const { routerDoneKey, routerRouteKey } = await import('@liquid-bricks/lib-component-builder/component/builder/router')
  const diagnostics = makeDiagnosticsInstance()
  const handlerDiagnostics = createHandlerDiagnostics(diagnostics)
  const parse = dep => parseDependencyPath({ handlerDiagnostics, dep, compName: 'root', hash: 'hash',
    dependencyType: 'task', dependencyName: 'done' })
  assert.deepEqual(parse('router.actuators.lifecycleDone'), {
    trimmedDep: 'router.actuators.lifecycleDone', importPath: [], targetType: 'data', targetName: routerDoneKey('actuators'),
  })
  assert.deepEqual(parse('child.router.actuators.lifecycleDone').importPath, ['child'])
  assert.throws(() => parse(`${routerRouteKey('actuators', 'create')}.task.done`), diagnostics.DiagnosticError)
  assert.throws(() => parse(`data.${routerDoneKey('actuators')}`), diagnostics.DiagnosticError)
  assert.throws(() => parse('router.actuators.other'), diagnostics.DiagnosticError)
})
