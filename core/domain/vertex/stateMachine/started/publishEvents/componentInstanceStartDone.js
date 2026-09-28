import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function componentInstanceStartDone({
  scope: { instanceId, instanceVertexId, stateMachineId },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  await natsContext.publish(
    createSubject(emits['component_service.evt.componentInstance.startDone.v1'])
      .forPublish()
      .env('prod')
      .build(),
    JSON.stringify({ data: { instanceId } }),
  )
  if (instanceVertexId && stateMachineId) {
    await natsContext.publish(
      createSubject(emits['component_service.cmd.componentInstance.check_state_machine_completion.v1'])
        .forPublish().env('prod').build(),
      JSON.stringify({ data: { instanceId, instanceVertexId, stateMachineId, type: 'component' } }),
    )
  }
}
