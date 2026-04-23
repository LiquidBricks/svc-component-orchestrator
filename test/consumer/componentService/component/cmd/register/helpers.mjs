import assert from 'node:assert/strict'

import router from '@liquid-bricks/lib-nats-subject/router'
import { Graph } from '@liquid-bricks/lib-nats-graph/graph'
import { diagnostics as makeDiagnostics } from '@liquid-bricks/lib-diagnostics'
import { ulid } from 'ulid'

import { createComponentServiceRouter } from '../../../../../../router.js'
import { path as registerPath } from '../../../../../../core/component/cmd/register/index.js'
import { dataMapper as createDataMapper, domain } from '@liquid-bricks/spec-domain/domain'
import { serviceConfiguration } from '../../../../../provider/serviceConfiguration/dotenv/index.js'
import { createRouteMessage, invokeRoute } from '../../../../../util/invokeRoute.js'

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

export function createGraphContext() {
  const diagnostics = makeDiagnosticsInstance()
  const graph = Graph({
    kv: 'nats',
    kvConfig: { servers: NATS_IP_ADDRESS, bucket: `component-register-${ulid()}` },
    diagnostics,
  })
  const g = graph.g
  const dataMapper = createDataMapper({ g, diagnostics })
  return { graph, diagnostics, g, dataMapper }
}

export async function withGraphContext(run) {
  const ctx = createGraphContext()
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

export function getRegisterSpec() {
  const router = createComponentServiceRouter({
    natsContext: {},
    g: {},
    diagnostics: makeDiagnosticsInstance(),
    dataMapper: {},
  })
  const route = router.routes.find(({ values }) =>
    values.channel === 'cmd'
    && values.entity === 'component'
    && values.action === 'register'
  )
  assert.ok(route, 'register route not found')
  return route.config
}

export const registerSpec = getRegisterSpec()

async function invokeHandlerList(handler, { rootCtx, scope } = {}) {
  const stageRouter = router({
    tokens: ['stage'],
    context: rootCtx,
  })
    .before(() => ({ ...(scope ?? {}) }))
    .route({ stage: 'handler' }, { handler })

  const message = createRouteMessage({ subject: 'handler' })
  const { scope: resultScope } = await stageRouter.request({ subject: 'handler', message })
  return resultScope
}

export async function registerHandlerComponent(context, component) {
  const { diagnostics, dataMapper, g } = context
  const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { component })
  return invokeHandlerList(registerSpec.handler, {
    rootCtx: { diagnostics, dataMapper, g },
    scope: { handlerDiagnostics, component },
  })
}

export async function registerComponent(context, component, options = {}) {
  return invokeRoute(context, { path: registerPath, data: component, ...options })
}

export { domain }
