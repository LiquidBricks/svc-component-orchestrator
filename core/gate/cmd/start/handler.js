import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { domain } from '@liquid-bricks/spec-domain/domain'
import {
  findImportPathBetweenComponents,
  findStateEdgeForNodeInInstanceTree,
  hasInstanceStarted,
  isNodeProvided,
  normalizeResult,
  setNested,
  vertexLabelToType,
} from '../../../componentInstance/cmd/dependencyUtils.js'

function pickFirst(values) {
  return Array.isArray(values) ? values[0] : values
}

function normalizeValues(list = []) {
  const raw = Array.isArray(list) && list.length === 1 ? list[0] : list
  const normalized = Array.isArray(raw) ? raw : (raw === undefined || raw === null ? [] : [raw])
  return Array.from(new Set(
    normalized
      .filter((value) => value !== undefined && value !== null && value !== '')
      .map(String),
  ))
}

async function resolveInstanceVertexId({ g, dataMapper, instanceId }) {
  if (!g || !instanceId) return null
  const [instanceVertexId] = await dataMapper.query.findInstanceVertexId({ instanceId })
  return instanceVertexId ?? null
}

async function resolveParentInstanceVertexIds({ g, dataMapper, gateInstanceVertexId, parentInstanceId }) {
  if (!g || !gateInstanceVertexId) return []
  if (parentInstanceId) {
    const parentInstanceVertexId = await resolveInstanceVertexId({ g, dataMapper, instanceId: parentInstanceId })
    return parentInstanceVertexId ? [parentInstanceVertexId] : []
  }
  return dataMapper.query.findUsesGateGateInstanceRefComponentInstance({ vertexId: gateInstanceVertexId })
}

async function areRequirementsProvided({ g, dataMapper, rootInstanceVertexId, requirements = [], stateEdgeCache, pathResolutionCache }) {
  if (!requirements?.length) return true
  for (const targetNodeId of requirements) {
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

async function resolveDependencyComponentId({ g, dataMapper, depNodeId, depType }) {
  if (depType === 'task') {
    const [depComponentId] = await dataMapper.query.findComponentIdForTask({ vertexId: depNodeId })
    return depComponentId
  }
  if (depType === 'data') {
    const [depComponentId] = await dataMapper.query.findComponentIdForData({ vertexId: depNodeId })
    return depComponentId
  }
  return null
}

async function buildGateDependencyPayload({
  g, dataMapper,
  rootInstanceVertexId,
  dependentComponentId,
  dependencyNodeIds = [],
  stateEdgeCache,
  importPathCache,
}) {
  const deps = {}
  const seen = new Set()

  for (const depNodeId of dependencyNodeIds ?? []) {
    if (!depNodeId || seen.has(depNodeId)) continue
    seen.add(depNodeId)

    const stateEdgeInfo = await findStateEdgeForNodeInInstanceTree({
      g, dataMapper,
      rootInstanceVertexId,
      targetNodeId: depNodeId,
      stateEdgeCache,
    })
    if (!stateEdgeInfo) continue

    const [depValues] = await dataMapper.query.readDepValues({ vertexId: depNodeId })
    const depLabelValues = depValues?.label ?? depValues
    const depType = vertexLabelToType(Array.isArray(depLabelValues) ? depLabelValues[0] : depLabelValues)
    const depNameValues = depValues?.name ?? depValues
    const depName = Array.isArray(depNameValues) ? depNameValues[0] : depNameValues
    if (!depType || !depName) continue

    const depComponentId = await resolveDependencyComponentId({ g, dataMapper, depNodeId, depType })
    const importPathCacheKey = `${dependentComponentId}:${depComponentId}`
    let aliasPath = []
    if (depComponentId && dependentComponentId && depComponentId !== dependentComponentId) {
      if (importPathCache.has(importPathCacheKey)) {
        aliasPath = importPathCache.get(importPathCacheKey) ?? []
      } else {
        aliasPath = await findImportPathBetweenComponents({
          g, dataMapper,
          fromComponentId: dependentComponentId,
          toComponentId: depComponentId,
        }) ?? []
        importPathCache.set(importPathCacheKey, aliasPath)
      }
    }

    const [stateValues] = await dataMapper.query.readDependencyStateResult({ edgeId: stateEdgeInfo.stateEdgeId })
    const resultValues = stateValues?.result ?? stateValues
    const result = normalizeResult(Array.isArray(resultValues) ? resultValues[0] : resultValues)
    const path = [...aliasPath, depType, depName].join('.')
    setNested(deps, path, result)
  }

  return deps
}

async function publishGateComputeRequest({
  natsContext,
  instanceId,
  emits,
  componentHash,
  name,
  deps,
}) {
  const subject = createBasicSubject(emits['gateway.cmd.component.compute_function.v1']).forPublish()
    .env('prod')
    .build()

  await natsContext.publish(
    subject,
    JSON.stringify({
      data: {
        instanceId,
        componentHash,
        name,
        type: 'gate',
        deps,
      },
    }),
  )
}

async function getParentContext({ g, dataMapper, parentInstanceVertexId }) {
  const [instanceValues] = await dataMapper.query.readParentInstanceId({ vertexId: parentInstanceVertexId })
  const parentInstanceId = pickFirst(instanceValues?.instanceId ?? instanceValues)
  if (!parentInstanceId) return null

  const [dependentComponentId] = await dataMapper.query.findDependentComponentId({ vertexId: parentInstanceVertexId })
  if (!dependentComponentId) return null

  const [componentValues] = await dataMapper.query.readComponentValues({ vertexId: dependentComponentId })
  const componentHash = pickFirst(componentValues?.hash ?? componentValues)
  if (!componentHash) return null

  return { parentInstanceId, dependentComponentId, componentHash }
}

async function loadGateRefsForParent({
  g, dataMapper,
  parentInstanceVertexId,
  gateInstanceVertexId,
}) {
  const gateRefs = []
  const gateRefInstanceIds = await dataMapper.query.findGateInstanceRefIdForInstance({ vertexId: parentInstanceVertexId, id: gateInstanceVertexId })

  for (const gateRefInstanceId of gateRefInstanceIds ?? []) {
    const [gateRefId] = await dataMapper.query.findGateRefIdForInstanceRef({ vertexId: gateRefInstanceId })
    const [gateRefValues] = gateRefId
      ? await dataMapper.query.readGateRefAliasAndName({ vertexId: gateRefId })
      : []
    const aliasValues = gateRefValues?.alias ?? gateRefValues
    const alias = pickFirst(aliasValues)
    const nameValues = gateRefValues?.name ?? gateRefValues
    const name = alias ?? pickFirst(nameValues)
    if (!gateRefId || !name) continue

    const taskWaitForIds = await dataMapper.query.listGateTaskWaitForIds({ vertexId: gateRefId })
    const dataWaitForIds = await dataMapper.query.listGateDataWaitForIds({ vertexId: gateRefId })
    const depsTaskIds = await dataMapper.query.listDepsTaskIds({ vertexId: gateRefId })
    const depsDataIds = await dataMapper.query.listDepsDataIds({ vertexId: gateRefId })

    const waitFor = normalizeValues([
      ...(taskWaitForIds ?? []),
      ...(dataWaitForIds ?? []),
    ])
    const deps = normalizeValues([
      ...(depsTaskIds ?? []),
      ...(depsDataIds ?? []),
    ])

    gateRefs.push({ name, waitFor, deps })
  }

  return gateRefs
}

export async function handler({
  rootCtx: { natsContext, g, dataMapper },
  routeCtx: { emits },
  scope: { instanceId, parentInstanceId },
}) {
  if (!instanceId || !g) return

  const gateInstanceVertexId = await resolveInstanceVertexId({ g, dataMapper, instanceId })
  if (!gateInstanceVertexId) return

  const alreadyRunning = await hasInstanceStarted({ g, dataMapper, instanceVertexId: gateInstanceVertexId })
  if (alreadyRunning) return

  const parentInstanceVertexIds = await resolveParentInstanceVertexIds({
    g, dataMapper,
    gateInstanceVertexId,
    parentInstanceId,
  })
  if (!parentInstanceVertexIds?.length) return

  const stateEdgeCache = new Map()
  const pathResolutionCache = new Map()
  const importPathCache = new Map()

  for (const parentInstanceVertexId of new Set(parentInstanceVertexIds)) {
    if (!parentInstanceVertexId) continue
    const parentContext = await getParentContext({ g, dataMapper, parentInstanceVertexId })
    if (!parentContext) continue

    const gateRefs = await loadGateRefsForParent({
      g, dataMapper,
      parentInstanceVertexId,
      gateInstanceVertexId,
    })
    if (!gateRefs.length) continue

    const dispatched = new Set()
    for (const { name, waitFor, deps = [] } of gateRefs) {
      if (!name || dispatched.has(name)) continue

      const requirements = [
        ...(Array.isArray(waitFor) ? waitFor : []),
        ...(Array.isArray(deps) ? deps : []),
      ]
      const ready = await areRequirementsProvided({
        g, dataMapper,
        rootInstanceVertexId: parentInstanceVertexId,
        requirements,
        stateEdgeCache,
        pathResolutionCache,
      })
      if (!ready) continue

      const gateDeps = await buildGateDependencyPayload({
        g, dataMapper,
        rootInstanceVertexId: parentInstanceVertexId,
        dependentComponentId: parentContext.dependentComponentId,
        dependencyNodeIds: deps,
        stateEdgeCache,
        importPathCache,
      })

      dispatched.add(name)
      await publishGateComputeRequest({
        natsContext,
        instanceId: parentContext.parentInstanceId,
        componentHash: parentContext.componentHash,
        name,
        deps: gateDeps,
        emits,
      })
    }
  }
}
