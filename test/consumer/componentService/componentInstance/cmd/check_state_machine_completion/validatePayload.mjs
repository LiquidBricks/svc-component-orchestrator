import test from 'node:test'
import assert from 'node:assert/strict'

import { diagnostics as makeDiagnostics } from '@liquid-bricks/lib-diagnostics'

import { validatePayload } from '../../../../../../core/componentInstance/cmd/check_state_machine_completion/validatePayload.js'

const noop = () => {}

function makeHandlerDiagnostics(scope) {
  const diagnostics = makeDiagnostics({
    logger: { info: noop, warn: noop, error: noop, debug: noop },
    metrics: { timing: noop, count: noop },
    sample: () => true,
    rateLimit: () => true,
  })
  const handlerDiagnostics = diagnostics.child
    ? diagnostics.child({ router: { stage: 'unit-test' }, scope })
    : diagnostics

  return { diagnostics, handlerDiagnostics }
}

function invoke(scope) {
  const { diagnostics, handlerDiagnostics } = makeHandlerDiagnostics(scope)
  return {
    diagnostics,
    run: () => validatePayload({ scope: { ...scope, handlerDiagnostics } }),
  }
}

test('accepts data and task checks and normalizes the legacy status field', () => {
  const data = invoke({
    instanceId: 'instance-1',
    instanceVertexId: 'instance-vertex-1',
    stateMachineId: 'state-machine-1',
    stateEdgeId: 'data-edge-1',
    status: 'provided',
    type: 'data',
  })
  const task = invoke({
    instanceId: 'instance-1',
    instanceVertexId: 'instance-vertex-1',
    stateMachineId: 'state-machine-1',
    stateEdgeId: 'task-edge-1',
    stateEdgeStatus: 'provided',
    type: 'task',
  })

  assert.deepEqual(data.run(), { stateEdgeStatus: 'provided' })
  assert.deepEqual(task.run(), { stateEdgeStatus: 'provided' })
})

test('accepts a gate check whose in-flight result is false', () => {
  const validation = invoke({
    instanceId: 'instance-1',
    instanceVertexId: 'instance-vertex-1',
    stateMachineId: 'state-machine-1',
    stateEdgeId: 'gate-state-edge-1',
    gateInstanceRefId: 'gate-ref-1',
    result: false,
    type: 'gate',
  })

  assert.doesNotThrow(validation.run)
})

for (const { name, scope } of [
  {
    name: 'a required instance identifier',
    scope: {
      instanceId: '',
      instanceVertexId: 'instance-vertex-1',
      stateMachineId: 'state-machine-1',
      stateEdgeId: 'state-edge-1',
      stateEdgeStatus: 'provided',
      type: 'data',
    },
  },
  {
    name: 'a supported completion-check type',
    scope: {
      instanceId: 'instance-1',
      instanceVertexId: 'instance-vertex-1',
      stateMachineId: 'state-machine-1',
      type: 'unknown',
    },
  },
  {
    name: 'a state edge identifier for data/task checks',
    scope: {
      instanceId: 'instance-1',
      instanceVertexId: 'instance-vertex-1',
      stateMachineId: 'state-machine-1',
      stateEdgeStatus: 'provided',
      type: 'data',
    },
  },
  {
    name: 'an in-flight state status for data/task checks',
    scope: {
      instanceId: 'instance-1',
      instanceVertexId: 'instance-vertex-1',
      stateMachineId: 'state-machine-1',
      stateEdgeId: 'state-edge-1',
      type: 'task',
    },
  },
  {
    name: 'a state edge identifier for gate checks',
    scope: {
      instanceId: 'instance-1',
      instanceVertexId: 'instance-vertex-1',
      stateMachineId: 'state-machine-1',
      gateInstanceRefId: 'gate-ref-1',
      result: true,
      type: 'gate',
    },
  },
  {
    name: 'a gate reference identifier for gate checks',
    scope: {
      instanceId: 'instance-1',
      instanceVertexId: 'instance-vertex-1',
      stateMachineId: 'state-machine-1',
      stateEdgeId: 'gate-state-edge-1',
      result: true,
      type: 'gate',
    },
  },
  {
    name: 'an in-flight result for gate checks',
    scope: {
      instanceId: 'instance-1',
      instanceVertexId: 'instance-vertex-1',
      stateMachineId: 'state-machine-1',
      stateEdgeId: 'gate-state-edge-1',
      gateInstanceRefId: 'gate-ref-1',
      type: 'gate',
    },
  },
]) {
  test(`rejects a payload without ${name}`, () => {
    const validation = invoke(scope)

    assert.throws(validation.run, validation.diagnostics.DiagnosticError)
  })
}
