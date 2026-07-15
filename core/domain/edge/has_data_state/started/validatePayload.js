import { Errors } from '../../../../../errors.js'

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
      Errors.PRECONDITION_REQUIRED,
      `${field} required for data started`,
      { field },
    )
  }
  handlerDiagnostics.require(
    scope.type === 'data',
    Errors.PRECONDITION_INVALID,
    'type must be data for data started',
    { field: 'type', type: scope.type },
  )
  handlerDiagnostics.require(
    scope.status === 'running' && scope.stateEdgeStatus === 'running',
    Errors.PRECONDITION_INVALID,
    'status must be running for data started',
    { field: 'status', status: scope.status, stateEdgeStatus: scope.stateEdgeStatus },
  )
  handlerDiagnostics.require(
    scope.deps && typeof scope.deps === 'object' && !Array.isArray(scope.deps),
    Errors.PRECONDITION_INVALID,
    'deps must be an object for data started',
    { field: 'deps' },
  )

  return {
    stateId: scope.stateId,
    stateEdgeStatus: scope.stateEdgeStatus,
  }
}
