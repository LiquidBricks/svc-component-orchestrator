import { Errors } from '../../../../errors.js'
import { domain } from '@liquid-bricks/spec-domain/domain'

export async function attachComponentImports({
  rootCtx: { g, dataMapper },
  scope: { handlerDiagnostics, component, componentVID },
}) {
  const { hash, name: compName, imports = [] } = component

  const uniqueImportNamesSet = new Set()
  for (const importItem of imports) {
    const { name: importName, hash: importHash } = importItem

    handlerDiagnostics.require(
      typeof importName === 'string' && importName.length,
      Errors.PRECONDITION_REQUIRED,
      'import name required',
      { field: 'import.name', component: compName, hash },
    )
    handlerDiagnostics.require(
      typeof importHash === 'string' && importHash.length,
      Errors.PRECONDITION_REQUIRED,
      'import hash required',
      { field: 'import.hash', component: compName, hash, importName },
    )
    handlerDiagnostics.require(
      !uniqueImportNamesSet.has(importName),
      Errors.PRECONDITION_INVALID,
      `Duplicate import name: ${importName}`,
      { component: compName, hash, importName },
    )
    uniqueImportNamesSet.add(importName)

    const [importedComponentId] = await g
      .V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', importHash)
      .id()

    handlerDiagnostics.require(
      importedComponentId,
      Errors.PRECONDITION_INVALID,
      `Imported component not found: ${importName}#${importHash}`,
      { component: compName, hash, importName, importHash },
    )

    await dataMapper.edge.has_import.component_component.create({
      fromId: componentVID, toId: importedComponentId, alias: importName
    })
  }
}
