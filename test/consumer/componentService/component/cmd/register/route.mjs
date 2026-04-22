import test from 'node:test'
import assert from 'node:assert/strict'

import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { createRouteMessage } from '../../../../../util/invokeRoute.js'
import { domain, registerComponent, withGraphContext } from './helpers.mjs'

function makeRegisterSubject() {
  return createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('component')
    .channel('cmd')
    .action('register')
    .version('v1')
    .build()
}

function makeRegisteredSubject() {
  return createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('component')
    .channel('evt')
    .action('registered')
    .version('v1')
    .build()
}

test('register route executes decode/pre/handler/post and publishes component registered event', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('RegisterRouteSuccess')
      .task('setup', {})
      .toJSON()
    const publishCalls = []
    const subject = makeRegisterSubject()
    const message = createRouteMessage({ subject, data: component })
    const natsContext = { publish: async (...args) => publishCalls.push(args) }

    await registerComponent({ diagnostics, dataMapper, g }, component, { message, natsContext })

    assert.equal(message.acked, true)

    const [componentId] = await g
      .V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', component.hash)
      .id()
    assert.ok(componentId, 'component vertex missing')

    assert.equal(publishCalls.length, 1)
    const [publishedSubject, payload] = publishCalls[0]
    assert.equal(publishedSubject, makeRegisteredSubject())
    assert.deepEqual(JSON.parse(payload), { data: { hash: component.hash } })
  })
})

test('register route republishes and aborts when imports are missing', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('RegisterRouteMissingImport')
      .import('shared', { hash: 'missing-import-hash' })
      .toJSON()
    const publishCalls = []
    const subject = makeRegisterSubject()
    const message = createRouteMessage({ subject, data: component })
    const natsContext = { publish: async (...args) => publishCalls.push(args) }

    const { scope } = await registerComponent({ diagnostics, dataMapper, g }, component, { message, natsContext })

    assert.equal(message.acked, true)
    assert.equal(scope.status, 'aborted')

    const componentIds = await g
      .V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', component.hash)
      .id()
    assert.equal(componentIds.length, 0)

    assert.equal(publishCalls.length, 1)
    const [publishedSubject, payload] = publishCalls[0]
    assert.equal(publishedSubject, subject)
    assert.deepEqual(JSON.parse(payload), { data: component })
  })
})

test('register route republishes and aborts when gates are missing', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('RegisterRouteMissingGate')
      .gate('setup', { hash: 'missing-gate-hash' })
      .toJSON()
    const publishCalls = []
    const subject = makeRegisterSubject()
    const message = createRouteMessage({ subject, data: component })
    const natsContext = { publish: async (...args) => publishCalls.push(args) }

    const { scope } = await registerComponent({ diagnostics, dataMapper, g }, component, { message, natsContext })

    assert.equal(message.acked, true)
    assert.equal(scope.status, 'aborted')

    const componentIds = await g
      .V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', component.hash)
      .id()
    assert.equal(componentIds.length, 0)

    assert.equal(publishCalls.length, 1)
    const [publishedSubject, payload] = publishCalls[0]
    assert.equal(publishedSubject, subject)
    assert.deepEqual(JSON.parse(payload), { data: component })
  })
})

test('register route aborts without publishing when component already exists', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('RegisterRouteExisting')
      .task('setup', {})
      .toJSON()
    const publishCalls = []
    const subject = makeRegisterSubject()
    const message = createRouteMessage({ subject, data: component })
    const natsContext = { publish: async (...args) => publishCalls.push(args) }

    await dataMapper.vertex.component.create({ hash: component.hash, name: component.name })

    const { scope } = await registerComponent({ diagnostics, dataMapper, g }, component, { message, natsContext })

    assert.equal(message.acked, true)
    assert.equal(scope.status, 'aborted')

    const componentIds = await g
      .V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', component.hash)
      .id()
    assert.equal(componentIds.length, 1)
    assert.deepEqual(publishCalls, [])
  })
})
