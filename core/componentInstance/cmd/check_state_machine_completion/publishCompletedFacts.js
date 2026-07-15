import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function publishCompletedFacts({
  scope: { completedStateMachines = [] },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  const subject = createSubject(emits['domain.vertex.stateMachine.completed.v1'])
    .forPublish()
    .env('prod')
    .build()

  for (const { instanceId, stateMachineId } of completedStateMachines) {
    await natsContext.publish(
      subject,
      JSON.stringify({
        data: {
          instanceId,
          stateMachineId,
          updatedAt: new Date().toISOString(),
        },
      }),
    )
  }
}
