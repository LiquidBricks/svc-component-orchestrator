import { domain } from '@liquid-bricks/spec-domain/domain'

export async function componentImports({ rootCtx: { g }, scope: { componentId } }) {
  const imports = []
  const importRefIds = await g.V(componentId)
    .out(domain.edge.has_import.component_importRef.constants.LABEL)
    .id()

  for (const importRefId of importRefIds ?? []) {
    const [edgeValues] = await g.V(importRefId).valueMap('alias')
    const [importedComponentId] = await g
      .V(importRefId)
      .out(domain.edge.import_of.importRef_component.constants.LABEL)
      .id()

    const [importedComponentValues] = await g.V(importedComponentId).valueMap('hash')
    const aliasValues = edgeValues?.alias ?? edgeValues
    const alias = Array.isArray(aliasValues) ? aliasValues[0] : aliasValues
    const taskWaitForIds = await g
      .V(importRefId)
      .out(domain.edge.wait_for.importRef_task.constants.LABEL)
      .id()
    const dataWaitForIds = await g
      .V(importRefId)
      .out(domain.edge.wait_for.importRef_data.constants.LABEL)
      .id()
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
