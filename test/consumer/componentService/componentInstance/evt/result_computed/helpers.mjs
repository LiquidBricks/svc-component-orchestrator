import assert from 'node:assert/strict'

import { Graph } from '@liquid-bricks/lib-nats-graph/graph'
import { diagnostics as makeDiagnostics } from '@liquid-bricks/lib-diagnostics'
import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { ulid } from 'ulid'

import { createComponentServiceRouter } from '../../../../../../router.js'
import { path as registerPath } from '../../../../../../component/cmd/register/index.js'
import { STATE_EDGE_LABEL_BY_TYPE, STATE_EDGE_STATUS_BY_TYPE } from '../../../../../../componentInstance/evt/result_computed/constants.js'
import { validatePayload } from '../../../../../../componentInstance/evt/result_computed/validatePayload.js'
import { componentImports } from '../../../../../../componentInstance/cmd/create/loadData/componentImports.js'
import { dataMapper as createDataMapper, domain } from '@liquid-bricks/spec-domain/domain'
import { serviceConfiguration } from '../../../../../provider/serviceConfiguration/dotenv/index.js'
import { invokeRoute } from '../../../../../util/invokeRoute.js'

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

function createGraphContext() {
  const diagnostics = makeDiagnosticsInstance()
  const graph = Graph({
    kv: 'nats',
    kvConfig: { servers: NATS_IP_ADDRESS, bucket: `component-instance-result-${ulid()}` },
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

const createInstanceSpec = getCreateInstanceSpec()
const startInstanceSpec = getStartInstanceSpec()
const resultComputedSpec = getResultComputedSpec()
const stateMachineCompletedSpec = getStateMachineCompletedSpec()
const startDependantsSpec = getStartDependantsSpec()
const dataStartSpec = getDataStartSpec()

function getCreateInstanceSpec() {
  const router = createComponentServiceRouter({
    natsContext: {},
    g: {},
    diagnostics: makeDiagnosticsInstance(),
    dataMapper: {},
  })
  const route = router.routes.find(({ values }) =>
    values.channel === 'cmd'
    && values.entity === 'componentInstance'
    && values.action === 'create'
  )
  assert.ok(route, 'create route not found')
  return route.config
}

function getStartInstanceSpec() {
  const router = createComponentServiceRouter({
    natsContext: {},
    g: {},
    diagnostics: makeDiagnosticsInstance(),
    dataMapper: {},
  })
  const route = router.routes.find(({ values }) =>
    values.channel === 'cmd'
    && values.entity === 'componentInstance'
    && values.action === 'start'
  )
  assert.ok(route, 'start route not found')
  return route.config
}

function getResultComputedSpec() {
  const router = createComponentServiceRouter({
    natsContext: {},
    g: {},
    diagnostics: makeDiagnosticsInstance(),
    dataMapper: {},
  })
  const route = router.routes.find(({ values }) =>
    values.channel === 'evt'
    && values.entity === 'componentInstance'
    && values.action === 'result_computed'
  )
  assert.ok(route, 'result_computed route not found')
  return route.config
}

function getStateMachineCompletedSpec() {
  const router = createComponentServiceRouter({
    natsContext: {},
    g: {},
    diagnostics: makeDiagnosticsInstance(),
    dataMapper: {},
  })
  const route = router.routes.find(({ values }) =>
    values.channel === 'evt'
    && values.entity === 'componentInstance'
    && values.action === 'state_machine_completed'
  )
  assert.ok(route, 'state_machine_completed route not found')
  return route.config
}

function getStartDependantsSpec() {
  const router = createComponentServiceRouter({
    natsContext: {},
    g: {},
    diagnostics: makeDiagnosticsInstance(),
    dataMapper: {},
  })
  const route = router.routes.find(({ values }) =>
    values.channel === 'cmd'
    && values.entity === 'componentInstance'
    && values.action === 'start_dependants'
  )
  assert.ok(route, 'start_dependants route not found')
  return route.config
}

function getDataStartSpec() {
  const router = createComponentServiceRouter({
    natsContext: {},
    g: {},
    diagnostics: makeDiagnosticsInstance(),
    dataMapper: {},
  })
  const route = router.routes.find(({ values }) =>
    values.channel === 'cmd'
    && values.entity === 'data'
    && values.action === 'start'
  )
  assert.ok(route, 'data start route not found')
  return route.config
}

export function createHandlerDiagnostics(diagnostics, scope = {}, message) {
  return diagnostics.child
    ? diagnostics.child({ router: { stage: 'unit-test' }, scope, message })
    : diagnostics
}

export async function registerComponent(component, ctx) {
  await invokeRoute(ctx, { path: registerPath, data: component })
}

export async function createInstance(ctx, scope) {
  const handlerDiagnostics = createHandlerDiagnostics(ctx.diagnostics, scope)
  return createInstanceSpec.handler({ rootCtx: ctx, scope: { ...scope, handlerDiagnostics } })
}

export async function startInstance(ctx, scope) {
  const handlerDiagnostics = createHandlerDiagnostics(ctx.diagnostics, scope)
  return startInstanceSpec.handler({ rootCtx: ctx, scope: { ...scope, handlerDiagnostics } })
}

export async function loadImports({ g, componentId }) {
  const { imports = [] } = await componentImports({ rootCtx: { g }, scope: { componentId } })
  return imports
}

export async function getComponentId({ g, diagnostics, componentHash }) {
  const [componentId] = await g
    .V()
    .has('label', domain.vertex.component.constants.LABEL)
    .has('hash', componentHash)
    .id()
  diagnostics.require(
    componentId,
    diagnostics.DiagnosticError,
    `component not found for componentHash ${componentHash}`,
  )
  return componentId
}

export function pickFirst(values) {
  if (Array.isArray(values)) return values[0]
  return values ?? null
}

export async function getStateMachineId({ g, instanceId }) {
  const [instanceVertexId] = await g
    .V()
    .has('label', domain.vertex.componentInstance.constants.LABEL)
    .has('instanceId', instanceId)
    .id()
  assert.ok(instanceVertexId, `componentInstance ${instanceId} missing`)

  const [stateMachineId] = await g
    .V(instanceVertexId)
    .out(domain.edge.has_stateMachine.componentInstance_stateMachine.constants.LABEL)
    .id()
  return { stateMachineId, instanceVertexId }
}

export async function getStateEdgeId({ g, stateMachineId, type, name }) {
  const [stateEdgeId] = await g
    .V(stateMachineId)
    .outE(STATE_EDGE_LABEL_BY_TYPE[type])
    .filter(_ => _.inV().has('name', name))
    .id()
  return stateEdgeId
}

export async function getImportedInstance({ g, rootInstanceVertexId, aliasPath }) {
  let current = rootInstanceVertexId
  for (const alias of aliasPath) {
    const [importInstanceRefId] = await g
      .V(current)
      .out(domain.edge.uses_import.componentInstance_importInstanceRef.constants.LABEL)
      .filter(_ => _.out(domain.edge.uses_import.importInstanceRef_importRef.constants.LABEL).has('alias', alias))
      .id()
    const [next] = importInstanceRefId
      ? await g
        .V(importInstanceRefId)
        .out(domain.edge.uses_import.importInstanceRef_componentInstance.constants.LABEL)
        .id()
      : []
    current = next
  }
  return current
}

export async function runSpec({ spec, rootCtx, message, initialScope = {} }) {
  const messagePayload = initialScope.handlerDiagnostics ? undefined : message?.json?.()
  const handlerDiagnostics = initialScope.handlerDiagnostics
    ?? createHandlerDiagnostics(rootCtx?.diagnostics, initialScope, messagePayload)
  let scope = { handlerDiagnostics, ...initialScope }

  const runStep = async (step) => {
    if (!step) return
    if (Array.isArray(step)) {
      for (const item of step) {
        await runStep(item)
      }
      return
    }
    if (typeof step !== 'function') {
      throw new TypeError('fn is not a function')
    }
    const result = await step({ message, rootCtx, scope })
    if (result && typeof result === 'object') {
      scope = { ...scope, ...result }
    }
  }

  for (const decode of spec.decode ?? []) {
    await runStep(decode)
  }
  for (const pre of spec.pre ?? []) {
    await runStep(pre)
  }
  await runStep(spec.handler)
  for (const post of spec.post ?? []) {
    await runStep(post)
  }

  return scope
}

export {
  createBasicSubject,
  domain,
  STATE_EDGE_LABEL_BY_TYPE,
  STATE_EDGE_STATUS_BY_TYPE,
  validatePayload,
  createInstanceSpec,
  startInstanceSpec,
  resultComputedSpec,
  stateMachineCompletedSpec,
  startDependantsSpec,
  dataStartSpec,
}
