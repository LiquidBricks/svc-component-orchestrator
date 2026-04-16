import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { domain } from '@liquid-bricks/spec-domain/domain'
import { hasInstanceStarted, isNodeProvided } from '../../../componentInstance/cmd/dependencyUtils.js'

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

async function resolveInstanceVertexId({ g, instanceId }) {
  if (!g || !instanceId) return null
  const [instanceVertexId] = await g
    .V()
    .has('label', domain.vertex.componentInstance.constants.LABEL)
    .has('instanceId', instanceId)
    .id()
  return instanceVertexId ?? null
}

async function resolveParentInstanceVertexIds({ g, importInstanceVertexId, parentInstanceId }) {
  if (!g || !importInstanceVertexId) return []
  if (parentInstanceId) {
    const parentInstanceVertexId = await resolveInstanceVertexId({ g, instanceId: parentInstanceId })
    return parentInstanceVertexId ? [parentInstanceVertexId] : []
  }
  return g
    .V(importInstanceVertexId)
    .in(domain.edge.uses_import.importInstanceRef_componentInstance.constants.LABEL)
    .in(domain.edge.uses_import.componentInstance_importInstanceRef.constants.LABEL)
    .id()
}

async function areWaitForsProvided({ g, rootInstanceVertexId, waitFor = [], stateEdgeCache, pathResolutionCache }) {
  if (!waitFor?.length) return true
  for (const targetNodeId of waitFor) {
    const ready = await isNodeProvided({
      g,
      rootInstanceVertexId,
      targetNodeId,
      stateEdgeCache,
      pathResolutionCache,
    })
    if (!ready) return false
  }
  return true
}

async function isImportReadyForParent({
  g,
  parentInstanceVertexId,
  importInstanceVertexId,
  stateEdgeCache,
  pathResolutionCache,
}) {
  const importRefInstanceIds = await g
    .V(parentInstanceVertexId)
    .out(domain.edge.uses_import.componentInstance_importInstanceRef.constants.LABEL)
    .filter(_ => _.out(domain.edge.uses_import.importInstanceRef_componentInstance.constants.LABEL).has('id', importInstanceVertexId))
    .id()

  if (!importRefInstanceIds?.length) return false

  for (const importRefInstanceId of importRefInstanceIds) {
    const [importRefId] = await g
      .V(importRefInstanceId)
      .out(domain.edge.uses_import.importInstanceRef_importRef.constants.LABEL)
      .id()
    const taskWaitForIds = importRefId
      ? await g.V(importRefId).out(domain.edge.wait_for.importRef_task.constants.LABEL).id()
      : []
    const dataWaitForIds = importRefId
      ? await g.V(importRefId).out(domain.edge.wait_for.importRef_data.constants.LABEL).id()
      : []
    const waitFor = normalizeWaitForValues([
      ...(taskWaitForIds ?? []),
      ...(dataWaitForIds ?? []),
    ])

    const ready = await areWaitForsProvided({
      g,
      rootInstanceVertexId: parentInstanceVertexId,
      waitFor,
      stateEdgeCache,
      pathResolutionCache,
    })
    if (ready) return true
  }

  return false
}

async function shouldStartImport({ g, importInstanceVertexId, parentInstanceId }) {
  if (!g || !importInstanceVertexId) return true

  const alreadyStarted = await hasInstanceStarted({ g, instanceVertexId: importInstanceVertexId })
  if (alreadyStarted) return false

  const parentInstanceVertexIds = await resolveParentInstanceVertexIds({
    g,
    importInstanceVertexId,
    parentInstanceId,
  })
  if (!parentInstanceVertexIds?.length) return true

  const stateEdgeCache = new Map()
  const pathResolutionCache = new Map()
  for (const parentInstanceVertexId of new Set(parentInstanceVertexIds)) {
    if (!parentInstanceVertexId) continue
    const ready = await isImportReadyForParent({
      g,
      parentInstanceVertexId,
      importInstanceVertexId,
      stateEdgeCache,
      pathResolutionCache,
    })
    if (ready) return true
  }

  return false
}

export async function handler({ rootCtx: { natsContext, g }, scope: { instanceId, parentInstanceId } }) {
  if (!instanceId) return

  let readyToStart = true
  if (g) {
    const importInstanceVertexId = await resolveInstanceVertexId({ g, instanceId })
    readyToStart = await shouldStartImport({
      g,
      importInstanceVertexId,
      parentInstanceId,
    })
  }
  if (!readyToStart) return

  const subject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('componentInstance')
    .channel('cmd')
    .action('start')
    .version('v1')

  await natsContext.publish(
    subject.build(),
    JSON.stringify({ data: { instanceId } })
  )
}
