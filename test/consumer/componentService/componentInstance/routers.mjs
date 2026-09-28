import test from 'node:test'
import assert from 'node:assert/strict'
import { component } from '@liquid-bricks/lib-component-builder'
import { routerDoneKey, routerRouteKey } from '@liquid-bricks/lib-component-builder/component/builder/router'
import { Graph } from '@liquid-bricks/lib-nats-graph/graph'
import { diagnostics as makeDiagnostics } from '@liquid-bricks/lib-diagnostics'
import { dataMapper as makeDataMapper } from '@liquid-bricks/spec-domain/domain'
import { invokeRoute } from '../../../util/invokeRoute.js'
import { path as registerPath } from '../../../../core/componentAgent/cmd/registerComponent/index.js'
import { handler as createInstance } from '../../../../core/componentInstance/cmd/create/handler/index.js'
import { componentGates } from '../../../../core/componentInstance/cmd/create/loadData/componentGates.js'
import { componentImports } from '../../../../core/componentInstance/cmd/create/loadData/componentImports.js'
import { handler as startGate } from '../../../../core/gate/cmd/start/handler.js'
import { emits as gateStartEmits } from '../../../../core/gate/cmd/start/index.js'
import { publishStartIfPassed } from '../../../../core/domain/edge/has_gate_state/result_computed/publishStartIfPassed.js'
import { emits as gateResultEmits } from '../../../../core/domain/edge/has_gate_state/result_computed/index.js'
import { handler as checkCompletion } from '../../../../core/componentInstance/cmd/check_state_machine_completion/handler.js'
import { publishCompletedFacts } from '../../../../core/componentInstance/cmd/check_state_machine_completion/publishCompletedFacts.js'
import { emits as completionEmits } from '../../../../core/componentInstance/cmd/check_state_machine_completion/index.js'
import { taskDependencyResults } from '../../../../core/task/cmd/start/loadData/taskDependencyResults.js'
import { usesGateInstances } from '../../../../core/componentInstance/cmd/start/loadData/usesGateInstances.js'
import { handler as startDependants } from '../../../../core/componentInstance/cmd/start_dependants/handler.js'

const first = value => Array.isArray(value) ? value[0] : value
async function fixture(t, definitions, root) {
  const noop = () => {}
  const diagnostics = makeDiagnostics({ logger: { info: noop, warn: noop, error: noop, debug: noop },
    metrics: { timing: noop, count: noop }, sample: () => true, rateLimit: () => true })
  const graph = Graph({ kv: 'memory', diagnostics })
  t.after(() => graph.close?.())
  const g = graph.g
  const dataMapper = makeDataMapper({ g, diagnostics })
  const published = []
  const ctx = { g, graph, dataMapper, diagnostics,
    natsContext: { publish: async (subject, payload) => published.push({ subject, ...JSON.parse(payload) }) } }
  for (const definition of [...definitions, root]) {
    await invokeRoute(ctx, { path: registerPath, data: { component: definition.toJSON(), agentID: 'test-agent' } })
    const found = await dataMapper.query.findComponentIdByHash({ hash: definition.toJSON().hash })
    assert.equal(found.length, 1, `registered ${definition.toJSON().name}`)
  }
  const [componentId] = await dataMapper.query.findComponentIdByHash({ hash: root.toJSON().hash })
  const { gates } = await componentGates({ rootCtx: ctx, scope: { componentId } })
  const { imports } = await componentImports({ rootCtx: ctx, scope: { componentId } })
  const created = await createInstance({ rootCtx: ctx, scope: {
    instanceId: 'root', componentId, componentHash: root.toJSON().hash, gates, imports,
  } })
  const scope = { ...created.createdInstances[0], handlerDiagnostics: diagnostics }
  published.length = 0
  async function routeState(router, route, result, status = 'provided') {
    const name = routerRouteKey(router, route)
    const [gateInstanceRefId] = await dataMapper.query.findGateInstanceRefIdByAlias({ vertexId: scope.instanceVertexId, alias: name })
    const [stateEdgeId] = await dataMapper.query.findGateStateEdgeIdForTargetNode({ vertexId: scope.stateMachineId, id: gateInstanceRefId })
    await dataMapper.edge.has_gate_state.stateMachine_gateInstanceRef.updateResultStatusUpdatedAt({
      edgeId: stateEdgeId, result: JSON.stringify(result) ?? null, status, updatedAt: new Date().toISOString(),
    })
    if (status === 'provided') await publishStartIfPassed({ rootCtx: ctx, routeCtx: { emits: gateResultEmits },
      scope: { ...scope, gateInstanceRefId, stateEdgeId, name, result } })
    return { gateInstanceRefId, stateEdgeId }
  }
  async function state(instanceVertexId, type, name, result, status = 'provided') {
    const [stateMachineId] = await dataMapper.query.readStateMachineId({ vertexId: instanceVertexId })
    const [stateEdgeId] = await dataMapper.query[type === 'data' ? 'findDataStateEdgeIdByName' : 'findTaskStateEdgeIdByName']({ vertexId: stateMachineId, name })
    assert.ok(stateEdgeId, `state exists: ${type}.${name}`)
    await dataMapper.edge[type === 'data' ? 'has_data_state' : 'has_task_state'][type === 'data' ? 'stateMachine_data' : 'stateMachine_task']
      .setStatusAndResult({ edgeId: stateEdgeId, status, result: JSON.stringify(result) ?? null })
    return stateEdgeId
  }
  const complete = () => checkCompletion({ rootCtx: ctx, scope })
  return { ctx, scope, created, published, routeState, state, complete, gates }
}

test('zero matches complete only after every predicate resolves, without instantiating children', async t => {
  const child = component('child').task('done', {})
  const root = component('root').data('config').router('actuators', route => [
    route('a', { hash: child, fnc: () => false, inject: _ => [_.a.task.done(_.data.config)] }),
    route('b', { hash: child, fnc: () => false, inject: _ => [_.b.task.done(_.data.config)] }),
  ]).task('done', { deps: _ => [_.router.actuators.lifecycleDone], fnc: ({ deps }) => deps.router.actuators.lifecycleDone })
  const f = await fixture(t, [child], root)
  assert.equal(f.created.createdInstances.length, 1)
  assert.equal(f.gates.length, 2)
  assert.equal((await f.complete()).completedRouters, undefined)
  await f.routeState('actuators', 'a', false)
  assert.equal((await f.complete()).completedRouters, undefined)
  await f.routeState('actuators', 'b', false)
  const result = await f.complete()
  assert.equal(result.completedRouters.length, 1)
  assert.equal(result.completedRouters[0].result, true)
  assert.deepEqual(await f.ctx.dataMapper.query.listGatedInstanceIds({ vertexId: f.scope.instanceVertexId }), [])
  await publishCompletedFacts({ rootCtx: f.ctx, scope: result, routeCtx: { emits: completionEmits } })
  assert.equal(f.published.at(-1).data.result, true)
  await f.state(f.scope.instanceVertexId, 'data', routerDoneKey('actuators'), true)
  const [taskNodeId] = await f.ctx.dataMapper.query.findComponentTaskNodeIdByName({ vertexId: f.scope.componentId, name: 'done' })
  const payload = await taskDependencyResults({ rootCtx: f.ctx, scope: { instanceVertexId: f.scope.instanceVertexId, taskNodeId } })
  assert.deepEqual(payload.deps, { router: { actuators: { lifecycleDone: true } } })
})

test('selected routes instantiate independently and receive existing injections only after selection', async t => {
  const grandchild = component('grandchild').task('work', {})
  const child = component('child').data('configuration').import('nested', { hash: grandchild })
  const root = component('root').data('config').router('actuators', route => [
    route('a', { hash: child, fnc: () => true, inject: _ => [_.a.data.configuration(_.data.config)] }),
    route('b', { hash: child, fnc: () => true, inject: _ => [_.b.data.configuration(_.data.config)] }),
    route('skip', { hash: child, fnc: () => false, inject: _ => [_.skip.data.configuration(_.data.config)] }),
  ])
  const f = await fixture(t, [grandchild, child], root)
  const configStateId = await f.state(f.scope.instanceVertexId, 'data', 'config', { image: 'pod' })
  let index = await f.ctx.dataMapper.vertex.componentInstance.index.injectionRouting.lookup({
    ...f.scope, stateEdgeId: configStateId, type: 'data',
  })
  assert.deepEqual(index.targets, [])
  await f.routeState('actuators', 'a', true)
  assert.equal(f.published.filter(event => event.subject.includes('componentInstance.created')).length, 2)
  assert.equal(f.published.filter(event => event.subject.includes('compute_function')).length, 1)
  await f.routeState('actuators', 'b', true)
  await f.routeState('actuators', 'skip', false)
  const children = await f.ctx.dataMapper.query.listGatedInstanceIds({ vertexId: f.scope.instanceVertexId })
  assert.equal(children.length, 2)
  index = await f.ctx.dataMapper.vertex.componentInstance.index.injectionRouting.lookup({ ...f.scope, stateEdgeId: configStateId, type: 'data' })
  assert.equal(index.targets.length, 2)
  assert.equal((await f.complete()).completedRouters, undefined)
  for (const childId of children) await f.state(childId, 'data', 'configuration', { image: 'pod' })
  const nested = []
  for (const childId of children) nested.push(...await f.ctx.dataMapper.query.listImportInstanceVertexIds({ vertexId: childId }))
  await f.state(nested[0], 'task', 'work', 'done')
  assert.equal((await f.complete()).completedRouters, undefined)
  await f.state(nested[1], 'task', 'work', 'done')
  assert.equal((await f.complete()).completedRouters.length, 1)
})

test('route predicates become ready independently and retain their parent dependency payload', async t => {
  const child = component('child')
  const root = component('root').data('first').data('later').router('actuators', route => [
    route('a', { hash: child, deps: _ => [_.data.first], fnc: ({ deps }) => deps.data.first }),
    route('b', { hash: child, deps: _ => [_.data.later], fnc: ({ deps }) => deps.data.later }),
  ])
  const f = await fixture(t, [child], root)
  const { usesGateInstances: routes } = await usesGateInstances({ rootCtx: f.ctx, scope: f.scope })
  assert.equal(routes.length, 2)
  const run = async () => {
    for (const route of routes) await startGate({ rootCtx: f.ctx, routeCtx: { emits: gateStartEmits },
      scope: { instanceId: route.instanceId, parentInstanceId: 'root' } })
  }
  await run()
  assert.equal(f.published.length, 0)
  const stateEdgeId = await f.state(f.scope.instanceVertexId, 'data', 'first', true)
  await run()
  assert.equal(f.published.length, 1)
  assert.equal(f.published[0].data.name, routerRouteKey('actuators', 'a'))
  assert.deepEqual(f.published[0].data.deps, { data: { first: true } })
  const [providedNodeId] = await f.ctx.dataMapper.query.findEdgeTargetNodeId({ edgeId: stateEdgeId })
  const { starters } = await startDependants({ rootCtx: f.ctx, scope: { ...f.scope, providedNodeId, type: 'data' } })
  assert.equal(starters[0].gateInstanceIds.length, 2)
})

test('empty routers complete, and predicate or subtree errors prevent completion', async t => {
  const child = component('child').task('work', {})
  const root = component('root').router('empty', () => [])
    .router('predicateError', route => route('same', { hash: child, fnc: () => { throw Error('failure') } }))
    .router('childError', route => route('same', { hash: child, fnc: () => true }))
  const f = await fixture(t, [child], root)
  await f.routeState('predicateError', 'same', undefined, 'error')
  await f.routeState('childError', 'same', true)
  const [childId] = await f.ctx.dataMapper.query.listGatedInstanceIds({ vertexId: f.scope.instanceVertexId })
  await f.state(childId, 'task', 'work', undefined, 'error')
  assert.deepEqual((await f.complete()).completedRouters.map(item => item.name), [routerDoneKey('empty')])
})

for (let mask = 0; mask < 8; mask++) {
  test(`all route combinations are valid: ${mask.toString(2).padStart(3, '0')}`, async t => {
    const child = component('emptyChild')
    const parent = component('root').router('group', route => [0, 1, 2].map(i =>
      route(`route${i}`, { hash: child, fnc: () => true })))
    const f = await fixture(t, [child], parent)
    for (let i = 0; i < 3; i++) await f.routeState('group', `route${i}`, Boolean(mask & (1 << i)))
    assert.equal((await f.ctx.dataMapper.query.listGatedInstanceIds({ vertexId: f.scope.instanceVertexId })).length,
      [0, 1, 2].filter(i => mask & (1 << i)).length)
    assert.equal((await f.complete()).completedRouters[0].result, true)
  })
}

test('route-local injections between parent values are also delayed until selection', async t => {
  const child = component('emptyChild')
  const parent = component('root').data('source').data('target')
    .router('group', route => route('selected', { hash: child, fnc: () => true,
      inject: _ => [_.data.target(_.data.source)] }))
  const f = await fixture(t, [child], parent)
  const stateEdgeId = await f.state(f.scope.instanceVertexId, 'data', 'source', 42)
  const lookup = () => f.ctx.dataMapper.vertex.componentInstance.index.injectionRouting.lookup({ ...f.scope, stateEdgeId, type: 'data' })
  assert.deepEqual((await lookup()).targets, [])
  await f.routeState('group', 'selected', true)
  assert.equal((await lookup()).targets.length, 1)
  const injections = f.published.filter(event => event.subject.includes('compute_function'))
  assert.equal(injections.length, 1)
  assert.equal(injections[0].data.name, 'target')
  assert.equal(injections[0].data.result, 42)
})

test('simultaneous selections retain injections for every selected branch', async t => {
  const child = component('child').data('configuration')
  const parent = component('root').data('config').router('group', route => [
    route('a', { hash: child, fnc: () => true, inject: _ => [_.a.data.configuration(_.data.config)] }),
    route('b', { hash: child, fnc: () => true, inject: _ => [_.b.data.configuration(_.data.config)] }),
    route('c', { hash: child, fnc: () => true, inject: _ => [_.c.data.configuration(_.data.config)] }),
  ])
  const f = await fixture(t, [child], parent)
  await Promise.all(['a', 'b', 'c'].map(name => f.routeState('group', name, true)))
  const stateEdgeId = await f.state(f.scope.instanceVertexId, 'data', 'config', 42)
  const routing = await f.ctx.dataMapper.vertex.componentInstance.index.injectionRouting.lookup({ ...f.scope, stateEdgeId, type: 'data' })
  assert.equal(routing.targets.length, 3)
})

test('a child completion checks its owning router and published completion unblocks dependants', async t => {
  const child = component('child').task('work', {})
  const parent = component('root').router('group', route => route('selected', { hash: child, fnc: () => true }))
    .task('done', { deps: _ => [_.router.group.lifecycleDone], fnc: () => 'done' })
  const f = await fixture(t, [child], parent)
  await f.routeState('group', 'selected', true)
  const [instanceVertexId] = await f.ctx.dataMapper.query.listGatedInstanceIds({ vertexId: f.scope.instanceVertexId })
  const [stateMachineId] = await f.ctx.dataMapper.query.readStateMachineId({ vertexId: instanceVertexId })
  const [identity] = await f.ctx.dataMapper.query.readInstanceIdValues({ vertexId: instanceVertexId })
  const stateEdgeId = await f.state(instanceVertexId, 'task', 'work', true)
  const result = await checkCompletion({ rootCtx: f.ctx, scope: { instanceId: first(identity.instanceId),
    instanceVertexId, stateMachineId, stateEdgeId, stateEdgeStatus: 'provided', type: 'task' } })
  assert.equal(result.completedRouters.length, 1)
  assert.equal(result.completedRouters[0].instanceVertexId, f.scope.instanceVertexId)
  assert.equal(result.completedStateMachines.length, 1)
  const completionStateId = await f.state(f.scope.instanceVertexId, 'data', routerDoneKey('group'), true)
  const [providedNodeId] = await f.ctx.dataMapper.query.findEdgeTargetNodeId({ edgeId: completionStateId })
  const { starters } = await startDependants({ rootCtx: f.ctx, scope: { ...f.scope, providedNodeId, type: 'data' } })
  assert.equal(starters[0].taskStateIds.length, 1)
  // Repeated gate start dispatches cannot reevaluate an already selected route.
  f.published.length = 0
  await startGate({ rootCtx: f.ctx, routeCtx: { emits: gateStartEmits },
    scope: { instanceId: first(identity.instanceId), parentInstanceId: 'root' } })
  assert.equal(f.published.length, 0)
})
