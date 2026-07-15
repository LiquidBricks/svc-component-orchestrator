import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function startGates({
  scope: { instanceId: parentInstanceId, usesGateInstances = [] },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  if (!usesGateInstances.length) return
  const subject = createSubject(emits['component_service.cmd.gate.start.v1'])
    .forPublish()
    .env('prod')
    .build()
  const started = new Set()

  for (const entry of usesGateInstances) {
    const gateInstanceId = typeof entry === 'string' ? entry : entry?.instanceId
    if (!gateInstanceId || started.has(gateInstanceId)) continue
    started.add(gateInstanceId)
    const data = { instanceId: gateInstanceId }
    if (parentInstanceId) data.parentInstanceId = parentInstanceId
    await natsContext.publish(subject, JSON.stringify({ data }))
  }
}
