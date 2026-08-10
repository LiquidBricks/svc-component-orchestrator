import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function startProvidedStateDependants({
  scope: { instanceId, providedStates = [] },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  if (!providedStates.length) return

  const subject = createSubject(
    emits['component_service.cmd.componentInstance.start_dependants.v1'],
  )
    .forPublish()
    .env('prod')
    .build()
  const published = new Set()

  for (const { stateEdgeId, type } of providedStates) {
    const key = `${type}:${stateEdgeId}`
    if (published.has(key)) continue
    published.add(key)

    await natsContext.publish(
      subject,
      JSON.stringify({
        data: {
          instanceId,
          stateEdgeId,
          type,
        },
      }),
    )
  }
}
