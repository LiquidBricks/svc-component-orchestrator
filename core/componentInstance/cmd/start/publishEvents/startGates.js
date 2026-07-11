import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function startGates({
  scope: { instanceId: parentInstanceId, usesGateInstances = [] },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  if (!usesGateInstances?.length) return

  const started = new Set()
  const normalizedGates = usesGateInstances
    .map((entry) => (typeof entry === 'string' ? { instanceId: entry } : entry))
    .filter(Boolean)

  const subject = createBasicSubject(emits['component_service.cmd.gate.start.v1']).forPublish()
    .env('prod')

  for (const { instanceId: gateInstanceId } of normalizedGates) {
    if (!gateInstanceId || started.has(gateInstanceId)) continue
    started.add(gateInstanceId)
    const data = { instanceId: gateInstanceId }
    if (parentInstanceId) data.parentInstanceId = parentInstanceId
    await natsContext.publish(
      subject.build(),
      JSON.stringify({ data }),
    )
  }
}
