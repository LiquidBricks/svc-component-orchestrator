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

export async function usesImportInstances({ rootCtx: { g, dataMapper }, scope: { instanceVertexId } }) {
  const imports = []
  const importRefInstanceIds = await dataMapper.query.listImportRefInstanceIds({ vertexId: instanceVertexId })

  for (const importRefInstanceId of importRefInstanceIds ?? []) {
    const [importRefId] = await dataMapper.query.findImportRefIdForInstanceRef({ vertexId: importRefInstanceId })
    const [edgeValues] = importRefId ? await dataMapper.query.readImportRefAlias({ vertexId: importRefId }) : []
    const aliasValues = edgeValues?.alias ?? edgeValues
    const alias = Array.isArray(aliasValues) ? aliasValues[0] : aliasValues
    let waitFor = []

    if (importRefId) {
      const taskWaitForIds = await dataMapper.query.listImportTaskWaitForIds({ vertexId: importRefId })
      const dataWaitForIds = await dataMapper.query.listImportDataWaitForIds({ vertexId: importRefId })
      const [lifecycleWaitForValues] = await dataMapper.query.readLifecycleWaitForValues({ importRefId })
      const lifecycleWaitFor = normalizeLifecycleWaitForValues(
        lifecycleWaitForValues?.[LIFECYCLE_WAIT_FOR_PROPERTY],
      )
      waitFor = normalizeWaitForValues([
        ...(taskWaitForIds ?? []),
        ...(dataWaitForIds ?? []),
        ...lifecycleWaitFor,
      ])
    }

    const [importInstanceVertexId] = await dataMapper.query.findImportInstanceVertexId({ vertexId: importRefInstanceId })
    if (!importInstanceVertexId) continue
    const [instanceValues] = await dataMapper.query.readImportInstanceId({ vertexId: importInstanceVertexId })
    const instanceIdValues = instanceValues?.instanceId ?? instanceValues
    const instanceId = Array.isArray(instanceIdValues) ? instanceIdValues[0] : instanceIdValues
    if (!instanceId) continue

    imports.push({ instanceId, alias, waitFor, instanceVertexId: importInstanceVertexId })
  }

  return { usesImportInstances: imports }
}
