import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { domain } from '@liquid-bricks/spec-domain/domain'
import {
  hasInstanceStarted,
  isNodeProvided,
  LIFECYCLE_WAIT_FOR_PROPERTY,
  normalizeLifecycleWaitForValues,
} from '../../../componentInstance/cmd/dependencyUtils.js'

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

async function resolveInstanceVertexId({ g, dataMapper, instanceId }) {
  if (!g || !instanceId) return null
  const [instanceVertexId] = await dataMapper.query.findInstanceVertexId({ instanceId })
  return instanceVertexId ?? null
}

async function resolveParentInstanceVertexIds({ g, dataMapper, importInstanceVertexId, parentInstanceId }) {
  if (!g || !importInstanceVertexId) return []
  if (parentInstanceId) {
    const parentInstanceVertexId = await resolveInstanceVertexId({ g, dataMapper, instanceId: parentInstanceId })
    return parentInstanceVertexId ? [parentInstanceVertexId] : []
  }
  return dataMapper.query.findUsesImportImportInstanceRefComponentInstance({ vertexId: importInstanceVertexId })
}

async function areWaitForsProvided({ g, dataMapper, rootInstanceVertexId, waitFor = [], stateEdgeCache, pathResolutionCache }) {
  if (!waitFor?.length) return true
  for (const targetNodeId of waitFor) {
    const ready = await isNodeProvided({
      g, dataMapper,
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
  g, dataMapper,
  parentInstanceVertexId,
  importInstanceVertexId,
  stateEdgeCache,
  pathResolutionCache,
}) {
  const importRefInstanceIds = await dataMapper.query.findImportInstanceRefIdForInstance({ vertexId: parentInstanceVertexId, id: importInstanceVertexId })

  if (!importRefInstanceIds?.length) return false

  for (const importRefInstanceId of importRefInstanceIds) {
    const [importRefId] = await dataMapper.query.findImportRefIdForInstanceRef({ vertexId: importRefInstanceId })
    const taskWaitForIds = importRefId
      ? await dataMapper.query.listImportTaskWaitForIds({ vertexId: importRefId })
      : []
    const dataWaitForIds = importRefId
      ? await dataMapper.query.listImportDataWaitForIds({ vertexId: importRefId })
      : []
    const [lifecycleWaitForValues] = importRefId
      ? await dataMapper.query.readLifecycleWaitForValues({ importRefId })
      : []
    const lifecycleWaitFor = normalizeLifecycleWaitForValues(
      lifecycleWaitForValues?.[LIFECYCLE_WAIT_FOR_PROPERTY],
    )
    const waitFor = normalizeWaitForValues([
      ...(taskWaitForIds ?? []),
      ...(dataWaitForIds ?? []),
      ...lifecycleWaitFor,
    ])

    const ready = await areWaitForsProvided({
      g, dataMapper,
      rootInstanceVertexId: parentInstanceVertexId,
      waitFor,
      stateEdgeCache,
      pathResolutionCache,
    })
    if (ready) return true
  }

  return false
}

async function shouldStartImport({ g, dataMapper, importInstanceVertexId, parentInstanceId }) {
  if (!g || !importInstanceVertexId) return true

  const alreadyStarted = await hasInstanceStarted({ g, dataMapper, instanceVertexId: importInstanceVertexId })
  if (alreadyStarted) return false

  const parentInstanceVertexIds = await resolveParentInstanceVertexIds({
    g, dataMapper,
    importInstanceVertexId,
    parentInstanceId,
  })
  if (!parentInstanceVertexIds?.length) return true

  const stateEdgeCache = new Map()
  const pathResolutionCache = new Map()
  for (const parentInstanceVertexId of new Set(parentInstanceVertexIds)) {
    if (!parentInstanceVertexId) continue
    const ready = await isImportReadyForParent({
      g, dataMapper,
      parentInstanceVertexId,
      importInstanceVertexId,
      stateEdgeCache,
      pathResolutionCache,
    })
    if (ready) return true
  }

  return false
}

export async function handler({
  rootCtx: { natsContext, g, dataMapper },
  routeCtx: { emits },
  scope: { instanceId, parentInstanceId },
}) {
  if (!instanceId) return

  let readyToStart = true
  if (g) {
    const importInstanceVertexId = await resolveInstanceVertexId({ g, dataMapper, instanceId })
    readyToStart = await shouldStartImport({
      g, dataMapper,
      importInstanceVertexId,
      parentInstanceId,
    })
  }
  if (!readyToStart) return

  const subject = createBasicSubject(emits['component_service.cmd.componentInstance.start.v1']).forPublish()
    .env('prod')

  await natsContext.publish(
    subject.build(),
    JSON.stringify({ data: { instanceId } })
  )
}
