import test from 'node:test'
import assert from 'node:assert/strict'

import { domain } from '@liquid-bricks/spec-domain/domain'

import { handler } from '../../../../../../core/componentInstance/cmd/check_state_machine_completion/handler.js'

const DATA_PROVIDED = domain.edge.has_data_state.stateMachine_data.constants.Status.PROVIDED

function values(key, value) {
  return [{ [key]: [value] }]
}

test('uses the in-flight state status and traverses parent instances once', async () => {
  const statusReads = []
  const parentStateMachineReads = []
  const query = {
    listTaskStateEdgeIds: async () => [],
    listDataStateEdgeIds: async ({ vertexId }) => {
      if (vertexId === 'state-machine-child') return ['edge-in-flight']
      if (vertexId === 'state-machine-parent') return ['edge-parent']
      assert.fail(`unexpected state machine: ${vertexId}`)
    },
    readStateEdgeStatus: async ({ edgeId }) => {
      statusReads.push(edgeId)
      if (edgeId === 'edge-in-flight') {
        assert.fail('the in-flight state edge must not be read from storage')
      }
      return values('status', DATA_PROVIDED)
    },
    listImportInstanceVertexIds: async () => [],
    listGateStateEdgeIds: async () => [],
    readStateMachineState: async () => values('state', 'running'),
    listImportParentInstanceVertexIds: async ({ vertexId }) =>
      vertexId === 'instance-child' ? ['instance-parent'] : [],
    listGateParentInstanceVertexIds: async ({ vertexId }) =>
      vertexId === 'instance-child' ? ['instance-parent'] : [],
    readStateMachineId: async ({ vertexId }) => {
      parentStateMachineReads.push(vertexId)
      assert.equal(vertexId, 'instance-parent')
      return ['state-machine-parent']
    },
    readInstanceIdValues: async ({ vertexId }) => {
      assert.equal(vertexId, 'instance-parent')
      return values('instanceId', 'instance-parent-id')
    },
  }

  const result = await handler({
    rootCtx: { dataMapper: { query } },
    scope: {
      instanceId: 'instance-child-id',
      instanceVertexId: 'instance-child',
      stateMachineId: 'state-machine-child',
      stateEdgeId: 'edge-in-flight',
      stateEdgeStatus: DATA_PROVIDED,
      type: 'data',
    },
  })

  assert.deepEqual(result, {
    completedStateMachines: [
      { instanceId: 'instance-child-id', stateMachineId: 'state-machine-child' },
      { instanceId: 'instance-parent-id', stateMachineId: 'state-machine-parent' },
    ],
  })
  assert.deepEqual(statusReads, ['edge-parent'])
  assert.deepEqual(parentStateMachineReads, ['instance-parent'])
})

test('uses the in-flight passing gate result while traversing the gated instance', async () => {
  const traversedStateMachines = []
  const query = {
    listTaskStateEdgeIds: async () => [],
    listDataStateEdgeIds: async ({ vertexId }) => {
      traversedStateMachines.push(vertexId)
      if (vertexId === 'state-machine-root') return []
      if (vertexId === 'state-machine-gate') return ['edge-gate']
      assert.fail(`unexpected state machine: ${vertexId}`)
    },
    readStateEdgeStatus: async ({ edgeId }) => {
      assert.equal(edgeId, 'edge-gate')
      return values('status', DATA_PROVIDED)
    },
    listImportInstanceVertexIds: async () => [],
    listGateStateEdgeIds: async ({ vertexId }) =>
      vertexId === 'state-machine-root' ? ['gate-edge-in-flight'] : [],
    findEdgeTargetNodeId: async ({ edgeId }) => {
      assert.equal(edgeId, 'gate-edge-in-flight')
      return ['gate-ref-in-flight']
    },
    readResultValues: async () => {
      assert.fail('the in-flight gate result must not be read from storage')
    },
    findGateInstanceVertexIdForRef: async ({ vertexId }) => {
      assert.equal(vertexId, 'gate-ref-in-flight')
      return ['instance-gate']
    },
    readGateStateMachineId: async ({ vertexId }) => {
      assert.equal(vertexId, 'instance-gate')
      return ['state-machine-gate']
    },
    readStateMachineState: async ({ vertexId }) => {
      assert.equal(vertexId, 'state-machine-root')
      return values('state', 'running')
    },
    listImportParentInstanceVertexIds: async () => [],
    listGateParentInstanceVertexIds: async () => [],
  }

  const result = await handler({
    rootCtx: { dataMapper: { query } },
    scope: {
      instanceId: 'instance-root-id',
      instanceVertexId: 'instance-root',
      stateMachineId: 'state-machine-root',
      stateEdgeId: 'gate-edge-in-flight',
      gateInstanceRefId: 'gate-ref-in-flight',
      resultValue: 'true',
      type: 'gate',
    },
  })

  assert.deepEqual(result, {
    completedStateMachines: [
      { instanceId: 'instance-root-id', stateMachineId: 'state-machine-root' },
    ],
  })
  assert.deepEqual(traversedStateMachines, ['state-machine-root', 'state-machine-gate'])
})
