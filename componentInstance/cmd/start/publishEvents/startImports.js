import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function startImports({
  scope: { instanceId: parentInstanceId, usesImportInstances = [] },
  rootCtx: { natsContext },
}) {
  if (!usesImportInstances?.length) return
  const started = new Set()
  const normalizedImports = usesImportInstances
    .map((entry) => (typeof entry === 'string' ? { instanceId: entry } : entry))
    .filter(Boolean)

  const subject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('import')
    .channel('cmd')
    .action('start')
    .version('v1')
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
