import assert from 'node:assert/strict'

import { Graph } from '@liquid-bricks/lib-nats-graph/graph'
import { diagnostics as makeDiagnostics } from '@liquid-bricks/lib-diagnostics'
import { ulid } from 'ulid'

import { createComponentServiceRouter } from '../../../router.js'
import { path as registerPath } from '../../../core/component/cmd/register/index.js'
import { dataMapper as createDataMapper, domain } from '@liquid-bricks/spec-domain/domain'
import { serviceConfiguration } from '../../provider/serviceConfiguration/dotenv/index.js'
import { invokeRoute } from '../../util/invokeRoute.js'

const { NATS_IP_ADDRESS } = serviceConfiguration()
assert.ok(NATS_IP_ADDRESS, 'NATS_IP_ADDRESS missing; set in .env or .env.local')

const noop = () => { }

export function makeDiagnosticsInstance() {
  return makeDiagnostics({
    logger: { info: noop, warn: noop, error: noop, debug: noop },
    metrics: { timing: noop, count: noop },
    sample: () => true,
    rateLimit: () => true,
  })
}

export function createGraphContext({ bucketPrefix = 'component-service' } = {}) {
  const diagnostics = makeDiagnosticsInstance()
  const graph = Graph({
    kv: 'nats',
    kvConfig: { servers: NATS_IP_ADDRESS, bucket: `${bucketPrefix}-${ulid()}` },
    diagnostics,
  })
  const g = graph.g
  const dataMapper = createDataMapper({ g, diagnostics })
  return { graph, diagnostics, g, dataMapper }
}

export async function withGraphContext(run, options) {
  const ctx = createGraphContext(options)
  try {
    await run(ctx)
  } finally {
    try { await ctx.graph?.close?.() } catch { }
  }
}

export function createHandlerDiagnostics(diagnostics, scope = {}, message) {
  return diagnostics.child
    ? diagnostics.child({ router: { stage: 'unit-test' }, scope, message })
    : diagnostics
}

const router = createComponentServiceRouter({
  natsContext: {},
  g: {},
  diagnostics: makeDiagnosticsInstance(),
  dataMapper: {},
})

export function getRouteSpec({ channel, entity, action }) {
  const route = router.routes.find(({ values }) =>
    values.channel === channel
    && values.entity === entity
    && values.action === action
  )
  assert.ok(route, `route not found for ${channel}.${entity}.${action}`)
  return route.config
}

const createInstanceSpec = getRouteSpec({ channel: 'cmd', entity: 'componentInstance', action: 'create' })

export async function registerComponent(context, component) {
  return invokeRoute(context, { path: registerPath, data: component })
}

export async function createInstance(context, scope) {
  const handlerDiagnostics = createHandlerDiagnostics(context.diagnostics, scope)
  return createInstanceSpec.handler({
    rootCtx: context,
    scope: { ...scope, handlerDiagnostics },
  })
}

export { domain }
