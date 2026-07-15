import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

const PAYLOAD_FIELDS = [
  'instanceId',
  'instanceVertexId',
  'stateMachineId',
  'stateEdgeId',
  'stateEdgeStatus',
  'status',
  'gateInstanceRefId',
  'type',
  'result',
  'resultValue',
]

export async function publishCheckStateMachineCompletionCommand({
  scope,
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  const data = {}
  for (const field of PAYLOAD_FIELDS) {
    if (scope[field] !== undefined) data[field] = scope[field]
  }

  const subject = createSubject(
    emits['component_service.cmd.componentInstance.check_state_machine_completion.v1'],
  )
    .forPublish()
    .env('prod')
    .build()

  await natsContext.publish(subject, JSON.stringify({ data }))
}
