import { Errors } from '../../../../../errors.js'

export function validatePayload({ scope }) {
  const { handlerDiagnostics } = scope
  for (const field of ['instanceId', 'instanceVertexId', 'stateMachineId', 'state', 'updatedAt']) {
    handlerDiagnostics.require(
      typeof scope[field] === 'string' && scope[field].length > 0,
      Errors.PRECONDITION_REQUIRED,
      `${field} required for stateMachine started`,
      { field },
    )
  }
  for (const field of ['dataStateIds', 'taskStateIds', 'importInstanceIds', 'gateInstanceIds']) {
    handlerDiagnostics.require(
      Array.isArray(scope[field]) && scope[field].every((id) => typeof id === 'string' && id.length > 0),
      Errors.PRECONDITION_INVALID,
      `${field} must be a string array for stateMachine started`,
      { field },
    )
  }
  handlerDiagnostics.require(
    scope.state === 'running',
    Errors.PRECONDITION_INVALID,
    'state must be running for stateMachine started',
    { field: 'state', state: scope.state },
  )

  return {
    usesImportInstances: scope.importInstanceIds,
    usesGateInstances: scope.gateInstanceIds,
  }
}
