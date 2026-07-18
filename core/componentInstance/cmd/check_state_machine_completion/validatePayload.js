import { Errors } from '../../../../errors.js'

const TYPES = new Set(['data', 'task', 'gate'])

export function validatePayload({
  scope: {
    handlerDiagnostics,
    instanceId,
    instanceVertexId,
    stateMachineId,
    stateEdgeId,
    stateEdgeStatus,
    status,
    gateInstanceRefId,
    type,
    result,
    resultValue,
  },
}) {
  for (const [field, value] of Object.entries({ instanceId, instanceVertexId, stateMachineId })) {
    handlerDiagnostics.require(
      typeof value === 'string' && value.length,
      Errors.PRECONDITION_REQUIRED,
      `${field} required for check_state_machine_completion`,
      { field },
    )
  }

  handlerDiagnostics.require(
    TYPES.has(type),
    Errors.PRECONDITION_INVALID,
    'type must be data, task, or gate for check_state_machine_completion',
    { field: 'type', type },
  )

  if (type === 'data' || type === 'task') {
    handlerDiagnostics.require(
      typeof stateEdgeId === 'string' && stateEdgeId.length,
      Errors.PRECONDITION_REQUIRED,
      'stateEdgeId required for state completion check',
      { field: 'stateEdgeId' },
    )

    const normalizedStatus = stateEdgeStatus ?? status
    handlerDiagnostics.require(
      typeof normalizedStatus === 'string' && normalizedStatus.length,
      Errors.PRECONDITION_REQUIRED,
      'stateEdgeStatus required for state completion check',
      { field: 'stateEdgeStatus' },
    )
    return { stateEdgeStatus: normalizedStatus }
  }

  handlerDiagnostics.require(
    typeof stateEdgeId === 'string' && stateEdgeId.length,
    Errors.PRECONDITION_REQUIRED,
    'stateEdgeId required for gate completion check',
    { field: 'stateEdgeId' },
  )
  handlerDiagnostics.require(
    typeof gateInstanceRefId === 'string' && gateInstanceRefId.length,
    Errors.PRECONDITION_REQUIRED,
    'gateInstanceRefId required for gate completion check',
    { field: 'gateInstanceRefId' },
  )
  handlerDiagnostics.require(
    typeof resultValue === 'string' || result !== undefined,
    Errors.PRECONDITION_REQUIRED,
    'result required for gate completion check',
    { field: 'result' },
  )
}
