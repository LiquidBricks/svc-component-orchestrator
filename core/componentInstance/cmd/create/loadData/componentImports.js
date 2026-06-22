import { domain } from '@liquid-bricks/spec-domain/domain'

export async function componentImports({ rootCtx: { g, dataMapper }, scope: { componentId } }) {
  const imports = []
  const importRefIds = await dataMapper.query.listImportRefIds({ vertexId: componentId })

  for (const importRefId of importRefIds ?? []) {
    const [edgeValues] = await dataMapper.query.readImportRefAlias({ vertexId: importRefId })
    const [importedComponentId] = await dataMapper.query.findImportedComponentIdForImportRef({ vertexId: importRefId })

    const [importedComponentValues] = await dataMapper.query.readImportedComponentValues({ vertexId: importedComponentId })
    const aliasValues = edgeValues?.alias ?? edgeValues
    const alias = Array.isArray(aliasValues) ? aliasValues[0] : aliasValues
    const taskWaitForIds = await dataMapper.query.listImportTaskWaitForIds({ vertexId: importRefId })
    const dataWaitForIds = await dataMapper.query.listImportDataWaitForIds({ vertexId: importRefId })
    const waitFor = Array.from(new Set(
      [...(taskWaitForIds ?? []), ...(dataWaitForIds ?? [])]
        .filter((value) => value !== undefined && value !== null && value !== '')
        .map(String)
    ))

    imports.push({
      alias,
      componentId: importedComponentId,
      componentHash: importedComponentValues.hash,
      waitFor,
      importRefId,
    })
  }

  return { imports }
}
