import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function startImports({
  scope: { instanceId: parentInstanceId, usesImportInstances = [] },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  if (!usesImportInstances?.length) return
  const started = new Set()
  const normalizedImports = usesImportInstances
    .map((entry) => (typeof entry === 'string' ? { instanceId: entry } : entry))
    .filter(Boolean)

  const subject = createBasicSubject(emits['component_service.cmd.import.start.v1']).forPublish()
    .env('prod')
  for (const { instanceId: importedInstanceId } of normalizedImports) {
    if (!importedInstanceId || started.has(importedInstanceId)) continue
    started.add(importedInstanceId)
    const data = { instanceId: importedInstanceId }
    if (parentInstanceId) data.parentInstanceId = parentInstanceId
    await natsContext.publish(
      subject.build(),
      JSON.stringify({ data })
    )
  }
}
