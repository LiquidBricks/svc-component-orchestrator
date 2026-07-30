import { PRECONDITION_INVALID, PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes'

export function validatePayload({ scope }) {
  const { handlerDiagnostics } = scope
  const requiredStrings = [
    'instanceId',
    'instanceVertexId',
    'stateMachineId',
    'stateEdgeId',
    'stateId',
    'nodeId',
    'componentHash',
    'name',
    'status',
    'stateEdgeStatus',
    'updatedAt',
  ]

  for (const field of requiredStrings) {
    handlerDiagnostics.require(
      typeof scope[field] === 'string' && scope[field].length > 0,
      PRECONDITION_REQUIRED,
      `${field} required for task started`,
      { field },
    )
  }
  handlerDiagnostics.require(
    scope.type === 'task',
    PRECONDITION_INVALID,
    'type must be task for task started',
    { field: 'type', type: scope.type },
  )
  handlerDiagnostics.require(
    scope.status === 'running' && scope.stateEdgeStatus === 'running',
    PRECONDITION_INVALID,
    'status must be running for task started',
    { field: 'status', status: scope.status, stateEdgeStatus: scope.stateEdgeStatus },
  )
  handlerDiagnostics.require(
    scope.deps && typeof scope.deps === 'object' && !Array.isArray(scope.deps),
    PRECONDITION_INVALID,
    'deps must be an object for task started',
    { field: 'deps' },
  )

  return {
    stateId: scope.stateId,
    stateEdgeStatus: scope.stateEdgeStatus,
  }
}
