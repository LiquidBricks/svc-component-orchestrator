import { PRECONDITION_INVALID, PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes'

export function validatePayload({ scope }) {
  const { handlerDiagnostics } = scope
  const providedStates = scope.providedStates ?? []
  for (const field of ['instanceId', 'instanceVertexId', 'stateMachineId', 'state', 'updatedAt']) {
    handlerDiagnostics.require(
      typeof scope[field] === 'string' && scope[field].length > 0,
      PRECONDITION_REQUIRED,
      `${field} required for stateMachine started`,
      { field },
    )
  }
  for (const field of ['dataStateIds', 'taskStateIds', 'importInstanceIds', 'gateInstanceIds']) {
    handlerDiagnostics.require(
      Array.isArray(scope[field]) && scope[field].every((id) => typeof id === 'string' && id.length > 0),
      PRECONDITION_INVALID,
      `${field} must be a string array for stateMachine started`,
      { field },
    )
  }
  handlerDiagnostics.require(
    Array.isArray(providedStates) && providedStates.every((state) =>
      state
      && typeof state === 'object'
      && !Array.isArray(state)
      && typeof state.stateEdgeId === 'string'
      && state.stateEdgeId.length > 0
      && ['data', 'task'].includes(state.type)
    ),
    PRECONDITION_INVALID,
    'providedStates must be an array of data or task state edge ids for stateMachine started',
    { field: 'providedStates' },
  )
  handlerDiagnostics.require(
    scope.state === 'running',
    PRECONDITION_INVALID,
    'state must be running for stateMachine started',
    { field: 'state', state: scope.state },
  )

  return {
    usesImportInstances: scope.importInstanceIds,
    usesGateInstances: scope.gateInstanceIds,
    providedStates,
  }
}
