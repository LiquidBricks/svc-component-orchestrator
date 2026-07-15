import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function startImports({
  scope: { instanceId: parentInstanceId, usesImportInstances = [] },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  if (!usesImportInstances.length) return
  const subject = createSubject(emits['component_service.cmd.import.start.v1'])
    .forPublish()
    .env('prod')
    .build()
  const started = new Set()

  for (const entry of usesImportInstances) {
    const importedInstanceId = typeof entry === 'string' ? entry : entry?.instanceId
    if (!importedInstanceId || started.has(importedInstanceId)) continue
    started.add(importedInstanceId)
    const data = { instanceId: importedInstanceId }
    if (parentInstanceId) data.parentInstanceId = parentInstanceId
    await natsContext.publish(subject, JSON.stringify({ data }))
  }
}
