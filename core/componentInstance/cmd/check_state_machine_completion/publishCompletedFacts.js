import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { Errors } from '../../../../errors.js'

export async function publishCompletedFacts({
  scope: { completedStateMachines = [], handlerDiagnostics },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  const subject = createSubject(emits['domain.vertex.stateMachine.completed.v1'])
    .forPublish()
    .env('prod')
    .build()

  for (const { instanceId, stateMachineId } of completedStateMachines) {
    for (const [field, value] of Object.entries({ instanceId, stateMachineId })) {
      handlerDiagnostics.require(
        typeof value === 'string' && value.length > 0,
        Errors.PRECONDITION_REQUIRED,
        `${field} required before publishing stateMachine completed`,
        { field },
      )
    }
    const updatedAt = new Date().toISOString()
    await natsContext.publish(
      subject,
      JSON.stringify({
        data: {
          instanceId,
          stateMachineId,
          updatedAt,
        },
      }),
    )
  }
}
