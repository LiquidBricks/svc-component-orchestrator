import test from 'node:test'
import assert from 'node:assert/strict'
import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import {
  createBasicSubject,
  withGraphContext,
  registerComponent,
  createInstance,
  loadImports,
  getComponentId,
  getStateMachineId,
  pickFirst,
  runSpec,
  computeResultDoneSpec,
  STATE_EDGE_STATUS_BY_TYPE,
  createHandlerDiagnostics,
  makeDiagnosticsInstance,
  validatePayload,
  domain,
} from './helpers.mjs'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


test('computeResultDone stores state result, marks status provided, and publishes start_dependants', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('ComputeResultDoneComponent')
      .data('dataInput', { deps: () => { } })
      .toJSON()

    await registerComponent(component, { diagnostics, dataMapper, g })

    const instanceId = 'instance-result-computed'
    const componentId = await getComponentId({ g, diagnostics, componentHash: component.hash })
    const imports = await loadImports({ g, componentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: component.hash, componentId, instanceId, imports })

    const { stateMachineId } = await getStateMachineId({ g, instanceId })
    const [stateEdgeId] = await g
      .V(stateMachineId)
      .outE(domain.edge.has_data_state.stateMachine_data.constants.LABEL)
      .filter(_ => _.inV().has('name', component.data[0].name))
      .id()
    assert.ok(stateEdgeId, 'data state edge missing')

    const [initialValues] = await g.E(stateEdgeId).valueMap('status', 'result', 'updatedAt')
    const initialUpdatedAt = pickFirst(initialValues?.updatedAt)
    assert.ok(initialUpdatedAt, 'initial updatedAt missing')

    const published = []
    let acked = false
    const message = {
      subject: createBasicSubject(natsEvents['*'].component_service['*']['*'].evt.componentInstance.computeResultDone.v1['*'])
        .env('prod')
        .build(),
      ack: () => { acked = true },
      json: () => ({
        data: {
          instanceId,
          type: 'data',
          name: component.data[0].name,
          result: { count: 2 },
        }
      }),
    }
    const rootCtx = {
      diagnostics,
      g,
      dataMapper,
      natsContext: { publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }) },
    }

    const finalScope = await runSpec({ spec: computeResultDoneSpec, rootCtx, message })

    assert.equal(finalScope.stateEdgeId, stateEdgeId)
    assert.equal(acked, true)

    const [updatedValues] = await g.E(stateEdgeId).valueMap('status', 'result', 'updatedAt')
    assert.equal(pickFirst(updatedValues.status), STATE_EDGE_STATUS_BY_TYPE.data)
    assert.equal(pickFirst(updatedValues.result), JSON.stringify({ count: 2 }))
    assert.notEqual(pickFirst(updatedValues.updatedAt), initialUpdatedAt)

    const startDependantsSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.start_dependants.v1['*'])
      .env('prod')
      .build()
    const completionSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].evt.componentInstance.state_machine_completed.v1['*'])
      .env('prod')
      .build()

    const startDependantsEvents = published.filter(p => p.subject === startDependantsSubject)
    assert.equal(startDependantsEvents.length, 1)
    assert.deepEqual(startDependantsEvents[0].payload.data, { instanceId, stateEdgeId, type: 'data' })

    const completionEvents = published.filter(p => p.subject === completionSubject)
    assert.equal(completionEvents.length, 1)
    assert.deepEqual(completionEvents[0].payload.data, { instanceId, stateMachineId })
  })
})

test('validatePayload rejects unknown result type', () => {
  const diagnostics = makeDiagnosticsInstance()
  const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { instanceId: 'i-1', type: 'unknown', name: 'x' })
  assert.throws(
    () => validatePayload({ scope: { handlerDiagnostics, instanceId: 'i-1', type: 'unknown', name: 'x' }, rootCtx: { diagnostics } }),
    diagnostics.DiagnosticError,
  )
})

test('validatePayload accepts gate result type', () => {
  const diagnostics = makeDiagnosticsInstance()
  const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { instanceId: 'i-1', type: 'gate', name: 'setup' })
  const scope = validatePayload({
    scope: { handlerDiagnostics, instanceId: 'i-1', type: 'gate', name: 'setup' },
    rootCtx: { diagnostics },
  })

  assert.equal(scope.stateEdgeLabel, undefined)
  assert.equal(scope.stateEdgeStatus, undefined)
})
