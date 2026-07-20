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

import { validatePayload } from '../../../../../../core/component/evt/compute_function/_helper/validatePayload.js'
import { componentImports } from '../../../../../../core/componentInstance/cmd/create/loadData/componentImports.js'
import { spec as stateMachineStartedSpec } from '../../../../../../core/domain/vertex/stateMachine/started/index.js'
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
const taskResultComputedSpec = getTaskResultComputedSpec()
const gateResultComputedSpec = getGateResultComputedSpec()
const resultComputedSpecByType = Object.freeze({ data: dataResultComputedSpec, task: taskResultComputedSpec, gate: gateResultComputedSpec })
const injectResultsSpec = getInjectResultsSpec()
const checkStateMachineCompletionSpec = getCheckStateMachineCompletionSpec()
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

function getTaskResultComputedSpec() {
  const router = createComponentServiceRouter({
    natsContext: {},
    g: {},
    diagnostics: makeDiagnosticsInstance(),
    dataMapper: {},
  })
  const route = router.routes.find(({ values }) =>
    values.ns === 'domain'
    && values.channel === 'edge'
    && values.entity === 'has_task_state'
    && values.action === 'result_computed'
  )
  assert.ok(route, 'task result_computed domain route not found')
  return route.config
}

function getGateResultComputedSpec() {
  const router = createComponentServiceRouter({
    natsContext: {},
    g: {},
    diagnostics: makeDiagnosticsInstance(),
    dataMapper: {},
  })
  const route = router.routes.find(({ values }) =>
    values.ns === 'domain'
    && values.channel === 'edge'
    && values.entity === 'has_gate_state'
    && values.action === 'result_computed'
  )
  assert.ok(route, 'has_gate_state result_computed domain route not found')
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

function getCheckStateMachineCompletionSpec() {
  const router = createComponentServiceRouter({
    natsContext: {},
    g: {},
    diagnostics: makeDiagnosticsInstance(),
    dataMapper: {},
  })
  const route = router.routes.find(({ values }) =>
    values.channel === 'cmd'
    && values.entity === 'componentInstance'
    && values.action === 'check_state_machine_completion'
  )
  assert.ok(route, 'check_state_machine_completion route not found')
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

export async function projectStateMachineStarted({ dataMapper }, { stateMachineId }) {
  await dataMapper.vertex.stateMachine.setRunning({ stateMachineId })
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


export const computeFunctionDataSubject = createBasicSubject(natsEvents['*'].component_service['*'].function_result.evt.component.compute_function.v1.data)
  .forPublish()
  .env('prod')
  .build()

export const computeFunctionGateSubject = createBasicSubject(natsEvents['*'].component_service['*'].function_result.evt.component.compute_function.v1.gate)
  .forPublish()
  .env('prod')
  .build()

export const computeFunctionTaskSubject = createBasicSubject(natsEvents['*'].component_service['*'].function_result.evt.component.compute_function.v1.task)
  .forPublish()
  .env('prod')
  .build()

export const injectResultsSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.injectResults.v1['*'])
  .forPublish()
  .env('prod')
  .build()

export const checkStateMachineCompletionSubject = createBasicSubject(
  natsEvents['*'].component_service['*']['*'].cmd.componentInstance.check_state_machine_completion.v1['*'],
)
  .forPublish()
  .env('prod')
  .build()

export const stateMachineCompletedFactSubject = createBasicSubject(
  natsEvents['*'].domain['*']['*'].vertex.stateMachine.completed.v1['*'],
)
  .forPublish()
  .env('prod')
  .build()

const stateMachineStartedFactSubject = createBasicSubject(
  natsEvents['*'].domain['*']['*'].vertex.stateMachine.started.v1['*'],
)
  .forPublish()
  .env('prod')
  .build()

export async function runInjectResultsCommands({ rootCtx, events }) {
  const subject = injectResultsSubject
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

const dataResultComputedSubject = createBasicSubject(natsEvents['*'].domain['*']['*'].edge.has_data_state.result_computed.v1['*'])
  .forPublish()
  .env('prod')
  .build()

const taskResultComputedSubject = createBasicSubject(natsEvents['*'].domain['*']['*'].edge.has_task_state.result_computed.v1['*'])
  .forPublish()
  .env('prod')
  .build()

const gateResultComputedSubject = createBasicSubject(natsEvents['*'].domain['*']['*'].edge.has_gate_state.result_computed.v1['*'])
  .forPublish()
  .env('prod')
  .build()

const resultComputedSubjectByType = Object.freeze({
  data: dataResultComputedSubject,
  task: taskResultComputedSubject,
  gate: gateResultComputedSubject,
})

function isResultComputedFact(event) {
  const type = event?.payload?.data?.type
  if (type === 'gate') {
    return event?.subject === resultComputedSubjectByType.gate
      && event?.payload?.data?.stateEdgeId
      && event?.payload?.data?.gateInstanceRefId
  }

  return event?.subject === resultComputedSubjectByType[type]
    && event?.payload?.data?.stateEdgeId
}

async function projectResultComputedFact({ rootCtx, payload }) {
  const fact = payload?.data ?? {}
  const result = typeof fact.resultValue === 'string'
    ? fact.resultValue
    : (fact.result != null ? JSON.stringify(fact.result) : '')
  if (fact.type === 'gate') {
    await rootCtx.dataMapper.edge.has_gate_state.stateMachine_gateInstanceRef.setResultAndUpdatedAt({
      edgeId: fact.stateEdgeId,
      result,
      updatedAt: fact.updatedAt,
    })
    return
  }

  const stateEdge = fact.type === 'task'
    ? rootCtx.dataMapper.edge.has_task_state.stateMachine_task
    : rootCtx.dataMapper.edge.has_data_state.stateMachine_data

  await stateEdge.updateResultStatusUpdatedAt({
    edgeId: fact.stateEdgeId,
    result,
    status: fact.stateEdgeStatus ?? fact.status,
    updatedAt: fact.updatedAt,
  })
}

async function projectStateMachineCompletedFact({ rootCtx, payload }) {
  const { stateMachineId, updatedAt } = payload?.data ?? {}
  await rootCtx.dataMapper.vertex.stateMachine.setComplete({ stateMachineId, updatedAt })
}

export async function runCheckStateMachineCompletionCommands({ rootCtx, events }) {
  const published = []

  for (const event of events.filter(({ subject }) => subject === checkStateMachineCompletionSubject)) {
    await runSpec({
      spec: checkStateMachineCompletionSpec,
      rootCtx: {
        ...rootCtx,
        natsContext: {
          ...rootCtx.natsContext,
          publish: async (subject, payload) => {
            let parsedPayload
            try {
              parsedPayload = JSON.parse(payload)
            } catch {
              parsedPayload = payload
            }
            published.push({ subject, payload: parsedPayload })
            return rootCtx.natsContext?.publish?.(subject, payload)
          },
        },
      },
      message: {
        subject: checkStateMachineCompletionSubject,
        ack: () => { },
        json: () => event.payload,
      },
      processDomainFacts: false,
    })
  }

  for (const fact of published.filter(({ subject }) => subject === stateMachineCompletedFactSubject)) {
    await projectStateMachineCompletedFact({ rootCtx, payload: fact.payload })
  }

  return published
}

async function processResultComputedFacts({ rootCtx, facts }) {
  for (const fact of facts.filter(isResultComputedFact)) {
    await projectResultComputedFact({ rootCtx, payload: fact.payload })
    await runSpec({
      spec: resultComputedSpecByType[fact.payload.data.type],
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

async function processStateMachineStartedFacts({ rootCtx, facts }) {
  for (const fact of facts.filter(({ subject }) => subject === stateMachineStartedFactSubject)) {
    await rootCtx.dataMapper.vertex.stateMachine.setRunning({
      stateMachineId: fact.payload.data.stateMachineId,
    })
    await runSpec({
      spec: stateMachineStartedSpec,
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
  const shouldProcessResultComputedFacts = processDomainFacts
    && requestedSpec === computeFunctionSpec
    && ['data', 'task', 'gate'].includes(resultType)
  const shouldProcessStartedFacts = processDomainFacts
    && requestedSpec === startInstanceSpec
  const processEmittedFacts = shouldProcessResultComputedFacts || shouldProcessStartedFacts
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
    const result = await runHookGroup(step, { message, rootCtx: activeRootCtx, routeCtx: spec.context, scope })
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

  if (shouldProcessResultComputedFacts) {
    await processResultComputedFacts({ rootCtx, facts: publishedDuringRoute })
  }
  if (shouldProcessStartedFacts) {
    await processStateMachineStartedFacts({ rootCtx, facts: publishedDuringRoute })
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
  computeFunctionSpec,
  injectResultsSpec,
  checkStateMachineCompletionSpec,
  startDependantsSpec,
  dataStartSpec,
  dataResultComputedSubject,
  taskResultComputedSubject,
  gateResultComputedSubject,
}
