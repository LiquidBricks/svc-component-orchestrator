import { s } from '@liquid-bricks/lib-nats-subject/router'

import { PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes'
import { domain } from '@liquid-bricks/spec-domain/domain'

export async function republishIfImportsMissing({
  message,
  rootCtx: { g, dataMapper, natsContext },
  scope: { handlerDiagnostics, component, componentAlreadyRegistered, [s.scope.ac]: abortCtl },
}) {
  if (componentAlreadyRegistered) return
  const { hash, name: compName, imports = [] } = component
  if (!imports.length) return

  const missingImports = []
  for (const importItem of imports) {
    const { name: importName, hash: importHash } = importItem ?? {}

    handlerDiagnostics.require(
      typeof importName === 'string' && importName.length,
      PRECONDITION_REQUIRED,
      'import name required',
      { field: 'import.name', component: compName, hash },
    )
    handlerDiagnostics.require(
      typeof importHash === 'string' && importHash.length,
      PRECONDITION_REQUIRED,
      'import hash required',
      { field: 'import.hash', component: compName, hash, importName },
    )

    const [importedComponentId] = await dataMapper.query.findImportedComponentIdByHash({ hash: importHash })

    if (!importedComponentId) {
      missingImports.push({ name: importName, hash: importHash })
    }
  }

  if (!missingImports.length) return

  await natsContext.publish(message.subject, JSON.stringify(message.json()))

  return abortCtl.abort({
    reason: 'imports not registered yet',
    hash,
    missingImports,
  })
}
