import { Errors } from '../../../../errors.js'
import { domain } from '@liquid-bricks/spec-domain/domain'

export async function attachComponentImports({
  rootCtx: { g, dataMapper },
  scope: { handlerDiagnostics, component, componentVID },
}) {
  const { hash, name: compName, imports = [] } = component

  const uniqueImportNamesSet = new Set()
  for (const importItem of imports) {
    const { name: importName, hash: importHash, waitFor } = importItem

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
    handlerDiagnostics.require(
      waitFor === undefined || Array.isArray(waitFor),
      Errors.PRECONDITION_INVALID,
      'import waitFor must be an array',
      { field: 'import.waitFor', component: compName, hash, importName },
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

    const { id: importRefId } = await dataMapper.vertex.importRef.create({ alias: importName })
    await dataMapper.edge.has_import.component_importRef.create({
      fromId: componentVID,
      toId: importRefId,
    })
    await dataMapper.edge.import_of.importRef_component.create({
      fromId: importRefId,
      toId: importedComponentId,
    })
  }
}
