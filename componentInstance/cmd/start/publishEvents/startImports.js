import { create as createBasicSubject } from '@liquid-bricks/shared-providers/subject/create/basic'

export async function startImports({ scope: { usesImportInstanceIds = [] }, rootCtx: { natsContext } }) {
  const uniqueInstanceIds = [...new Set(usesImportInstanceIds ?? [])]
  if (!uniqueInstanceIds.length) return

  const subject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('componentInstance')
    .channel('cmd')
    .action('start')
    .version('v1')

  for (const importedInstanceId of uniqueInstanceIds) {
    await natsContext.publish(
      subject.build(),
      JSON.stringify({ data: { instanceId: importedInstanceId } })
    )
  }
}
