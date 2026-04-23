import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
export async function startGates({
  scope: { instanceId: parentInstanceId, usesGateInstances = [] },
  rootCtx: { natsContext },
}) {
  if (!usesGateInstances?.length) return

  const started = new Set()
  const normalizedGates = usesGateInstances
    .map((entry) => (typeof entry === 'string' ? { instanceId: entry } : entry))
    .filter(Boolean)

  const subject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('gate')
    .channel('cmd')
    .action('start')
    .version('v1')

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
