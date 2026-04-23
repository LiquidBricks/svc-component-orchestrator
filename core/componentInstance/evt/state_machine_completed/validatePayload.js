import { Errors } from '../../../../errors.js'

export function validatePayload({ scope: { handlerDiagnostics, instanceId, stateMachineId } }) {
  handlerDiagnostics.require(
    typeof instanceId === 'string' && instanceId.length,
    Errors.PRECONDITION_REQUIRED,
    'instanceId required for state_machine_completed',
    { field: 'instanceId' },
  )

  handlerDiagnostics.require(
    typeof stateMachineId === 'string' && stateMachineId.length,
    Errors.PRECONDITION_REQUIRED,
    'stateMachineId required for state_machine_completed',
    { field: 'stateMachineId' },
  )
}
