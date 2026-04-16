import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { validatePayload } from '../../../../../../../component/cmd/register/validatePayload/index.js'
import { createHandlerDiagnostics, makeDiagnosticsInstance } from '../helpers.mjs'

function makeArgs(component) {
  const diagnostics = makeDiagnosticsInstance()
  const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { component })
  return { diagnostics, args: { scope: { handlerDiagnostics, component } } }
}

test('validatePayload deserializes the registration payload', () => {
  const component = componentBuilder('ok-component')
    .import('shared', { hash: 'import-hash' })
    .data('value', { deps: ({ task }) => task.result })
    .toJSON()
  component.hash = ' hash-ok '
  component.name = ' ok-component '
  component.imports = [{ name: ' shared ', hash: ' import-hash ' }]
  component.data = [{ name: ' value ', deps: [' task.result '] }]
  const { args } = makeArgs(component)

  const result = validatePayload(args)

  assert.deepEqual(result.component, {
    name: 'ok-component',
    hash: 'hash-ok',
    imports: [{ name: 'shared', hash: 'import-hash', inject: {}, waitFor: [], codeRef: undefined }],
    gates: [],
    data: [{ name: 'value', deps: ['task.result'], waitFor: [], inject: [], fnc: undefined, codeRef: undefined }],
    tasks: [],
  })
})

test('validatePayload rejects missing component hash', () => {
  const component = componentBuilder('MissingHash').toJSON()
  delete component.hash
  component.imports = []
  const { diagnostics, args } = makeArgs(component)

  assert.throws(
    () => validatePayload(args),
    diagnostics.DiagnosticError,
  )
})

test('validatePayload rejects missing component name', () => {
  const component = componentBuilder('MissingName').toJSON()
  delete component.name
  component.imports = []
  const { diagnostics, args } = makeArgs(component)

  assert.throws(
    () => validatePayload(args),
    diagnostics.DiagnosticError,
  )
})

test('validatePayload rejects non-array imports', () => {
  const component = componentBuilder('BadImports').toJSON()
  component.imports = {}
  const { diagnostics, args } = makeArgs(component)

  assert.throws(
    () => validatePayload(args),
    diagnostics.DiagnosticError,
  )
})
