import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { s } from '@liquid-bricks/lib-nats-subject/router'

import { createHandlerDiagnostics, registerSpec, withGraphContext } from './helpers.mjs'

const republishIfImportsMissing = registerSpec.pre.find(fn => fn.name === 'republishIfImportsMissing')

test('republishIfImportsMissing republishes and aborts when an import is missing', async () => {
  assert.ok(republishIfImportsMissing, 'republishIfImportsMissing pre hook missing')

  await withGraphContext(async ({ diagnostics, g }) => {
    const component = componentBuilder('MissingImportComponent')
      .import('SharedComponent', { hash: 'missing-hash' })
      .toJSON()

    const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { component })
    const abortCtl = { aborted: false, payload: null, abort(payload) { this.aborted = true; this.payload = payload } }
    const publishCalls = []
    const messagePayload = { data: component }
    const message = {
      subject: 'prod.component-service._._.cmd.component.register.v1._',
      json: () => messagePayload,
    }
    const natsContext = { publish: async (...args) => publishCalls.push(args) }

    await republishIfImportsMissing({
      message,
      rootCtx: { g, natsContext },
      scope: { handlerDiagnostics, component, [s.scope.ac]: abortCtl },
    })

    assert.equal(abortCtl.aborted, true)
    assert.deepEqual(abortCtl.payload, {
      reason: 'imports not registered yet',
      hash: component.hash,
      missingImports: component.imports.map(({ name, hash }) => ({ name, hash })),
    })
    assert.equal(publishCalls.length, 1)
    const [subject, payload] = publishCalls[0]
    assert.equal(subject, message.subject)
    assert.deepEqual(JSON.parse(payload), messagePayload)
  })
})

test('republishIfImportsMissing rejects missing import name', async () => {
  assert.ok(republishIfImportsMissing, 'republishIfImportsMissing pre hook missing')

  await withGraphContext(async ({ diagnostics, g }) => {
    const component = componentBuilder('MissingImportNameComponent')
      .import('SharedComponent', { hash: 'some-hash' })
      .toJSON()
    component.imports = [{ hash: 'some-hash' }]

    const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { component })
    const abortCtl = { aborted: false, payload: null, abort(payload) { this.aborted = true; this.payload = payload } }
    const message = {
      subject: 'prod.component-service._._.cmd.component.register.v1._',
      json: () => ({ data: component }),
    }

    await assert.rejects(
      republishIfImportsMissing({
        message,
        rootCtx: { g, natsContext: { publish: async () => { } } },
        scope: { handlerDiagnostics, component, [s.scope.ac]: abortCtl },
      }),
      diagnostics.DiagnosticError,
    )
  })
})

test('republishIfImportsMissing rejects missing import hash', async () => {
  assert.ok(republishIfImportsMissing, 'republishIfImportsMissing pre hook missing')

  await withGraphContext(async ({ diagnostics, g }) => {
    const component = componentBuilder('MissingImportHashComponent')
      .import('SharedComponent', { hash: 'some-hash' })
      .toJSON()
    component.imports = [{ name: 'SharedComponent' }]

    const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { component })
    const abortCtl = { aborted: false, payload: null, abort(payload) { this.aborted = true; this.payload = payload } }
    const message = {
      subject: 'prod.component-service._._.cmd.component.register.v1._',
      json: () => ({ data: component }),
    }

    await assert.rejects(
      republishIfImportsMissing({
        message,
        rootCtx: { g, natsContext: { publish: async () => { } } },
        scope: { handlerDiagnostics, component, [s.scope.ac]: abortCtl },
      }),
      diagnostics.DiagnosticError,
    )
  })
})

test('republishIfImportsMissing no-ops when imports already registered', async () => {
  assert.ok(republishIfImportsMissing, 'republishIfImportsMissing pre hook missing')

  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const importHash = 'shared-hash-exists'
    await dataMapper.vertex.component.create({ hash: importHash, name: 'SharedComponent' })

    const component = componentBuilder('ImportingComponent')
      .import('SharedComponent', { hash: importHash })
      .toJSON()

    const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { component })
    const abortCtl = { aborted: false, payload: null, abort(payload) { this.aborted = true; this.payload = payload } }
    const publishCalls = []
    const messagePayload = { data: component }
    const message = {
      subject: 'prod.component-service._._.cmd.component.register.v1._',
      json: () => messagePayload,
    }
    const natsContext = { publish: async (...args) => publishCalls.push(args) }

    await republishIfImportsMissing({
      message,
      rootCtx: { g, natsContext },
      scope: { handlerDiagnostics, component, [s.scope.ac]: abortCtl },
    })

    assert.equal(abortCtl.aborted, false)
    assert.deepEqual(publishCalls, [])
  })
})
