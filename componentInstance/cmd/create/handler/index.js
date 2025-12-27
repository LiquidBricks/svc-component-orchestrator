import { ulid } from 'ulid'
import { createComponentInstance } from './createComponentInstance.js'

export async function handler({ rootCtx: { g, dataMapper }, scope: { instanceId, componentId, imports } }) {
  const { instanceVertexId } = await createComponentInstance({ g, dataMapper, componentId, instanceId })

  const importedInstances = []
  for (const { alias, componentId: importedComponentId, componentHash: importedComponentHash } of imports) {
    const importedInstanceId = ulid()
    const { instanceVertexId: importedInstanceVertexId } = await createComponentInstance({
      g,
      dataMapper,
      componentId: importedComponentId,
      instanceId: importedInstanceId,
    })

    await dataMapper.edge.uses_import.componentInstance_componentInstance.create({
      fromId: instanceVertexId,
      toId: importedInstanceVertexId,
      alias,
    })

    importedInstances.push({ instanceId: importedInstanceId, componentHash: importedComponentHash, alias })
  }

  return { importedInstances }
}
