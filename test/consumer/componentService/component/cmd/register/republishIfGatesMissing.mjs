import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { s } from '@liquid-bricks/lib-nats-subject/router'

import { createHandlerDiagnostics, registerSpec, withGraphContext } from './helpers.mjs'

const republishIfGatesMissing = registerSpec.pre.find(fn => fn.name === 'republishIfGatesMissing')

test('republishIfGatesMissing republishes and aborts when a gate component is missing', async () => {
  assert.ok(republishIfGatesMissing, 'republishIfGatesMissing pre hook missing')

  await withGraphContext(async ({ diagnostics, g }) => {
    const component = componentBuilder('MissingGateComponent')
      .gate('setup', { hash: 'missing-gate-hash' })
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

    await republishIfGatesMissing({
      message,
      rootCtx: { g, natsContext },
      scope: { handlerDiagnostics, component, [s.scope.ac]: abortCtl },
    })

    assert.equal(abortCtl.aborted, true)
    assert.deepEqual(abortCtl.payload, {
      reason: 'gates not registered yet',
      hash: component.hash,
      missingGates: component.gates.map(({ name, hash }) => ({ name, hash })),
    })
    assert.equal(publishCalls.length, 1)
    const [subject, payload] = publishCalls[0]
    assert.equal(subject, message.subject)
    assert.deepEqual(JSON.parse(payload), messagePayload)
  })
})

test('republishIfGatesMissing rejects missing gate name', async () => {
  assert.ok(republishIfGatesMissing, 'republishIfGatesMissing pre hook missing')

  await withGraphContext(async ({ diagnostics, g }) => {
    const component = componentBuilder('MissingGateNameComponent')
      .gate('setup', { hash: 'some-hash' })
      .toJSON()
    component.gates = [{ hash: 'some-hash' }]

    const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { component })
    const abortCtl = { aborted: false, payload: null, abort(payload) { this.aborted = true; this.payload = payload } }
    const message = {
      subject: 'prod.component-service._._.cmd.component.register.v1._',
      json: () => ({ data: component }),
    }

    await assert.rejects(
      republishIfGatesMissing({
        message,
        rootCtx: { g, natsContext: { publish: async () => { } } },
        scope: { handlerDiagnostics, component, [s.scope.ac]: abortCtl },
      }),
      diagnostics.DiagnosticError,
    )
  })
})

test('republishIfGatesMissing rejects missing gate hash', async () => {
  assert.ok(republishIfGatesMissing, 'republishIfGatesMissing pre hook missing')

  await withGraphContext(async ({ diagnostics, g }) => {
    const component = componentBuilder('MissingGateHashComponent')
      .gate('setup', { hash: 'some-hash' })
      .toJSON()
    component.gates = [{ name: 'setup' }]

    const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { component })
    const abortCtl = { aborted: false, payload: null, abort(payload) { this.aborted = true; this.payload = payload } }
    const message = {
      subject: 'prod.component-service._._.cmd.component.register.v1._',
      json: () => ({ data: component }),
    }

    await assert.rejects(
      republishIfGatesMissing({
        message,
        rootCtx: { g, natsContext: { publish: async () => { } } },
        scope: { handlerDiagnostics, component, [s.scope.ac]: abortCtl },
      }),
      diagnostics.DiagnosticError,
    )
  })
})

test('republishIfGatesMissing no-ops when gate components already registered', async () => {
  assert.ok(republishIfGatesMissing, 'republishIfGatesMissing pre hook missing')

  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const gateHash = 'gate-hash-exists'
    await dataMapper.vertex.component.create({ hash: gateHash, name: 'SetupComponent' })

    const component = componentBuilder('GateUsingComponent')
      .gate('setup', { hash: gateHash })
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

    await republishIfGatesMissing({
      message,
      rootCtx: { g, natsContext },
      scope: { handlerDiagnostics, component, [s.scope.ac]: abortCtl },
    })

    assert.equal(abortCtl.aborted, false)
    assert.deepEqual(publishCalls, [])
  })
})
