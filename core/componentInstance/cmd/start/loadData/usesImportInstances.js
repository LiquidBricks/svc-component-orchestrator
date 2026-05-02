import { domain } from '@liquid-bricks/spec-domain/domain'
import {
  LIFECYCLE_WAIT_FOR_PROPERTY,
  normalizeLifecycleWaitForValues,
} from '../../dependencyUtils.js'

function normalizeWaitForValues(waitForValues = []) {
  const raw = Array.isArray(waitForValues) && waitForValues.length === 1 ? waitForValues[0] : waitForValues
  const list = Array.isArray(raw)
    ? raw
    : (raw === undefined || raw === null ? [] : [raw])
  return Array.from(new Set(
    list
      .filter((value) => value !== undefined && value !== null && value !== '')
      .map(String)
  ))
}

export async function usesImportInstances({ rootCtx: { g }, scope: { instanceVertexId } }) {
  const imports = []
  const importRefInstanceIds = await g
    .V(instanceVertexId)
    .out(domain.edge.uses_import.componentInstance_importInstanceRef.constants.LABEL)
    .id()

  for (const importRefInstanceId of importRefInstanceIds ?? []) {
    const [importRefId] = await g
      .V(importRefInstanceId)
      .out(domain.edge.uses_import.importInstanceRef_importRef.constants.LABEL)
      .id()
    const [edgeValues] = importRefId ? await g.V(importRefId).valueMap('alias') : []
    const aliasValues = edgeValues?.alias ?? edgeValues
    const alias = Array.isArray(aliasValues) ? aliasValues[0] : aliasValues
    let waitFor = []

    if (importRefId) {
      const taskWaitForIds = await g
        .V(importRefId)
        .out(domain.edge.wait_for.importRef_task.constants.LABEL)
        .id()
      const dataWaitForIds = await g
        .V(importRefId)
        .out(domain.edge.wait_for.importRef_data.constants.LABEL)
        .id()
      const [lifecycleWaitForValues] = await g
        .V(importRefId)
        .valueMap(LIFECYCLE_WAIT_FOR_PROPERTY)
      const lifecycleWaitFor = normalizeLifecycleWaitForValues(
        lifecycleWaitForValues?.[LIFECYCLE_WAIT_FOR_PROPERTY],
      )
      waitFor = normalizeWaitForValues([
        ...(taskWaitForIds ?? []),
        ...(dataWaitForIds ?? []),
        ...lifecycleWaitFor,
      ])
    }

    const [importInstanceVertexId] = await g
      .V(importRefInstanceId)
      .out(domain.edge.uses_import.importInstanceRef_componentInstance.constants.LABEL)
      .id()
    if (!importInstanceVertexId) continue
    const [instanceValues] = await g.V(importInstanceVertexId).valueMap('instanceId')
    const instanceIdValues = instanceValues?.instanceId ?? instanceValues
    const instanceId = Array.isArray(instanceIdValues) ? instanceIdValues[0] : instanceIdValues
    if (!instanceId) continue

    imports.push({ instanceId, alias, waitFor, instanceVertexId: importInstanceVertexId })
  }

  return { usesImportInstances: imports }
}
