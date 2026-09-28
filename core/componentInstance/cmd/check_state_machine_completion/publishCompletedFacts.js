import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes'
import { publishResultComputedFact } from '../../../component/evt/compute_function/data/publishResultComputedFact.js'

export async function publishCompletedFacts({
  scope: { completedStateMachines = [], completedRouters = [], handlerDiagnostics },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  for (const scope of completedRouters) {
    await publishResultComputedFact({ scope, rootCtx: { natsContext }, routeCtx: { emits } })
  }
  const subject = createSubject(emits['domain.vertex.stateMachine.completed.v1'])
    .forPublish()
    .env('prod')
    .build()

  for (const { instanceId, stateMachineId } of completedStateMachines) {
    for (const [field, value] of Object.entries({ instanceId, stateMachineId })) {
      handlerDiagnostics.require(
        typeof value === 'string' && value.length > 0,
        PRECONDITION_REQUIRED,
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
