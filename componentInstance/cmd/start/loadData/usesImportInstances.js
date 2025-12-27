import { domain } from '@liquid-bricks/spec-domain/domain'

export async function usesImportInstances({ rootCtx: { g }, scope: { instanceVertexId } }) {
  const importedValues = await g
    .V(instanceVertexId)
    .out(domain.edge.uses_import.componentInstance_componentInstance.constants.LABEL)
    .valueMap('instanceId')

  const usesImportInstanceIds = (importedValues ?? [])
    .map(values => {
      const instanceIdValues = values?.instanceId
      return Array.isArray(instanceIdValues) ? instanceIdValues[0] : instanceIdValues
    })
    .filter(Boolean)

  return { usesImportInstanceIds }
}
