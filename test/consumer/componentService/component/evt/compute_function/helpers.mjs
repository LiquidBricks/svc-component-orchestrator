import assert from 'node:assert/strict'

import { Graph } from '@liquid-bricks/lib-nats-graph/graph'
import { diagnostics as makeDiagnostics } from '@liquid-bricks/lib-diagnostics'
import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { ulid } from 'ulid'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

import { createComponentServiceRouter } from '../../../../../../router.js'
import { path as registerPath } from '../../../../../../core/componentAgent/cmd/registerComponent/index.js'
import { DATA_STATE_EDGE_LABEL, DATA_STATE_EDGE_STATUS } from '../../../../../../core/component/evt/compute_function/data/constants.js'
import { TASK_STATE_EDGE_LABEL, TASK_STATE_EDGE_STATUS } from '../../../../../../core/component/evt/compute_function/task/constants.js'
import { createResultComputedSubject } from '../../../../../../core/domain/edge/has_data_state/result_computed/subject.js'

import { validatePayload } from '../../../../../../core/component/evt/compute_function/_helper/validatePayload.js'
import { componentImports } from '../../../../../../core/componentInstance/cmd/create/loadData/componentImports.js'
import { dataMapper as createDataMapper, domain } from '@liquid-bricks/spec-domain/domain'
import { serviceConfiguration } from '../../../../../provider/serviceConfiguration/dotenv/index.js'
import { invokeRoute, runHookGroup } from '../../../../../util/invokeRoute.js'

const STATE_EDGE_LABEL_BY_TYPE = Object.freeze({ data: DATA_STATE_EDGE_LABEL, task: TASK_STATE_EDGE_LABEL })
const STATE_EDGE_STATUS_BY_TYPE = Object.freeze({ data: DATA_STATE_EDGE_STATUS, task: TASK_STATE_EDGE_STATUS })

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
const computeFunctionSpecs = getComputeFunctionSpecs()
const computeFunctionSpec = Symbol('computeFunctionSpec')
const dataResultComputedSpec = getDataResultComputedSpec()
const injectResultsSpec = getInjectResultsSpec()
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

function getComputeFunctionSpecs() {
  const router = createComponentServiceRouter({
    natsContext: {},
    g: {},
    diagnostics: makeDiagnosticsInstance(),
    dataMapper: {},
  })
  const routes = router.routes.filter(({ values }) =>
    values.context === 'function_result'
    && values.channel === 'evt'
    && values.entity === 'component'
    && values.action === 'compute_function'
  )
  assert.deepEqual(
    routes.map(({ values }) => values.id).sort(),
    ['data', 'gate', 'task'],
    'computeFunction routes missing',
  )
  return Object.fromEntries(routes.map(({ values, config }) => [values.id, config]))
}

function getDataResultComputedSpec() {
  const router = createComponentServiceRouter({
    natsContext: {},
    g: {},
    diagnostics: makeDiagnosticsInstance(),
    dataMapper: {},
  })
  const route = router.routes.find(({ values }) =>
    values.ns === 'domain'
    && values.channel === 'edge'
    && values.entity === 'has_data_state'
    && values.action === 'result_computed'
  )
  assert.ok(route, 'data result_computed domain route not found')
  return route.config
}

function getInjectResultsSpec() {
  const router = createComponentServiceRouter({
    natsContext: {},
    g: {},
    diagnostics: makeDiagnosticsInstance(),
    dataMapper: {},
  })
  const route = router.routes.find(({ values }) =>
    values.channel === 'cmd'
    && values.entity === 'componentInstance'
    && values.action === 'injectResults'
  )
  assert.ok(route, 'injectResults route not found')
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
  await invokeRoute(ctx, { path: registerPath, data: { component, agentID: 'test-agent' } })
}

export async function createInstance(ctx, scope) {
  const handlerDiagnostics = createHandlerDiagnostics(ctx.diagnostics, scope)
  return createInstanceSpec.handler({ rootCtx: ctx, scope: { ...scope, handlerDiagnostics } })
}

export async function startInstance(ctx, scope) {
  const handlerDiagnostics = createHandlerDiagnostics(ctx.diagnostics, scope)
  return startInstanceSpec.handler({ rootCtx: ctx, scope: { ...scope, handlerDiagnostics } })
}

export async function loadImports({ g, dataMapper, componentId }) {
  const { imports = [] } = await componentImports({ rootCtx: { g, dataMapper }, scope: { componentId } })
  return imports
}

export async function getComponentId({ g, dataMapper, diagnostics, componentHash }) {
  const [componentId] = await dataMapper.query.findComponentIdByHash({ hash: componentHash })
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

export function assertDataStartDependantsPayload(actual, { instanceId, stateEdgeId, result }) {
  assert.deepEqual({
    instanceId: actual.instanceId,
    stateEdgeId: actual.stateEdgeId,
    type: actual.type,
    status: actual.status,
    stateEdgeStatus: actual.stateEdgeStatus,
    result: actual.result,
  }, {
    instanceId,
    stateEdgeId,
    type: 'data',
    status: STATE_EDGE_STATUS_BY_TYPE.data,
    stateEdgeStatus: STATE_EDGE_STATUS_BY_TYPE.data,
    result,
  })
}

export async function getStateMachineId({ g, dataMapper, instanceId }) {
  const [instanceVertexId] = await dataMapper.query.findInstanceVertexId({ instanceId })
  assert.ok(instanceVertexId, `componentInstance ${instanceId} missing`)

  const [stateMachineId] = await dataMapper.query.readStateMachineId({ vertexId: instanceVertexId })
  return { stateMachineId, instanceVertexId }
}

export async function getStateEdgeId({ g, dataMapper, stateMachineId, type, name }) {
  const [stateEdgeId] = type === 'task'
    ? await dataMapper.query.findTaskStateEdgeIdByName({ vertexId: stateMachineId, name })
    : await dataMapper.query.findDataStateEdgeIdByName({ vertexId: stateMachineId, name })
  return stateEdgeId
}

export async function getImportedInstance({ g, dataMapper, rootInstanceVertexId, aliasPath }) {
  let current = rootInstanceVertexId
  for (const alias of aliasPath) {
    const [importInstanceRefId] = await dataMapper.query.findImportInstanceRefIdByAlias({ vertexId: current, alias })
    const [next] = importInstanceRefId
      ? await dataMapper.query.readNext({ vertexId: importInstanceRefId })
      : []
    current = next
  }
  return current
}


export function createComputeFunctionSubject(type) {
  const subjectSpec = natsEvents['*'].component_service['*'].function_result.evt.component.compute_function.v1[type]
  assert.ok(subjectSpec, 'computeFunction subject missing for type ' + type)
  return createBasicSubject(subjectSpec).forPublish().env('prod').build()
}

export function createInjectResultsSubject() {
  return createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.injectResults.v1['*'])
    .forPublish()
    .env('prod')
    .build()
}

export async function runInjectResultsCommands({ rootCtx, events }) {
  const subject = createInjectResultsSubject()
  const published = []

  for (const event of events.filter(entry => entry.subject === subject)) {
    await runSpec({
      spec: injectResultsSpec,
      rootCtx: {
        ...rootCtx,
        natsContext: {
          publish: async (publishedSubject, payload) => {
            published.push({ subject: publishedSubject, payload: JSON.parse(payload) })
          },
        },
      },
      message: {
        subject,
        ack: () => { },
        json: () => event.payload,
      },
    })
  }

  return published
}

const dataResultComputedSubject = createResultComputedSubject()

function isDataResultComputedFact(event) {
  return event?.subject === dataResultComputedSubject
    && event?.payload?.data?.type === 'data'
    && event?.payload?.data?.stateEdgeId
}

async function projectDataResultComputedFact({ rootCtx, payload }) {
  const fact = payload?.data ?? {}
  const result = typeof fact.resultValue === 'string'
    ? fact.resultValue
    : (fact.result != null ? JSON.stringify(fact.result) : '')

  await rootCtx.dataMapper.edge.has_data_state.stateMachine_data.updateResultStatusUpdatedAt({
    edgeId: fact.stateEdgeId,
    result,
    status: fact.stateEdgeStatus ?? fact.status,
    updatedAt: fact.updatedAt,
  })
}

async function processDataResultComputedFacts({ rootCtx, facts }) {
  for (const fact of facts.filter(isDataResultComputedFact)) {
    await projectDataResultComputedFact({ rootCtx, payload: fact.payload })
    await runSpec({
      spec: dataResultComputedSpec,
      rootCtx,
      message: {
        subject: fact.subject,
        ack: () => { },
        json: () => fact.payload,
      },
      processDomainFacts: false,
    })
  }
}

export async function runSpec({ spec, rootCtx, message, initialScope = {}, processDomainFacts = true }) {
  const messagePayload = initialScope.handlerDiagnostics ? undefined : message?.json?.()
  const requestedSpec = spec
  let resultType
  if (spec === computeFunctionSpec) {
    resultType = messagePayload?.data?.type
    spec = computeFunctionSpecs[resultType]
    assert.ok(spec, 'computeFunction route missing for type ' + resultType)
  }
  const processEmittedFacts = processDomainFacts
    && requestedSpec === computeFunctionSpec
    && resultType === 'data'
  const publishedDuringRoute = []
  const activeRootCtx = processEmittedFacts && rootCtx?.natsContext?.publish
    ? {
      ...rootCtx,
      natsContext: {
        ...rootCtx.natsContext,
        publish: async (subject, payload) => {
          try {
            publishedDuringRoute.push({ subject, payload: JSON.parse(payload) })
          } catch {
            publishedDuringRoute.push({ subject, payload })
          }
          return rootCtx.natsContext.publish(subject, payload)
        },
      },
    }
    : rootCtx
  const handlerDiagnostics = initialScope.handlerDiagnostics
    ?? createHandlerDiagnostics(rootCtx?.diagnostics, initialScope, messagePayload)
  let scope = { handlerDiagnostics, ...initialScope }

  const runStep = async (step) => {
    if (!step) return
    const result = await runHookGroup(step, { message, rootCtx: activeRootCtx, scope })
    if (result && typeof result === 'object') {
      Object.assign(scope, result)
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

  if (processEmittedFacts) {
    await processDataResultComputedFacts({ rootCtx, facts: publishedDuringRoute })
  }

  return scope
}

export {
  createBasicSubject,
  createResultComputedSubject,
  domain,
  STATE_EDGE_LABEL_BY_TYPE,
  STATE_EDGE_STATUS_BY_TYPE,
  validatePayload,
  createInstanceSpec,
  startInstanceSpec,
  computeFunctionSpec,
  injectResultsSpec,
  stateMachineCompletedSpec,
  startDependantsSpec,
  dataStartSpec,
}
