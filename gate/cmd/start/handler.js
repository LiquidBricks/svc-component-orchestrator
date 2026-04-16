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

async function resolveInstanceVertexId({ g, instanceId }) {
  if (!g || !instanceId) return null
  const [instanceVertexId] = await g
    .V()
    .has('label', domain.vertex.componentInstance.constants.LABEL)
    .has('instanceId', instanceId)
    .id()
  return instanceVertexId ?? null
}

async function resolveParentInstanceVertexIds({ g, gateInstanceVertexId, parentInstanceId }) {
  if (!g || !gateInstanceVertexId) return []
  if (parentInstanceId) {
    const parentInstanceVertexId = await resolveInstanceVertexId({ g, instanceId: parentInstanceId })
    return parentInstanceVertexId ? [parentInstanceVertexId] : []
  }
  return g
    .V(gateInstanceVertexId)
    .in(domain.edge.uses_gate.gateInstanceRef_componentInstance.constants.LABEL)
    .in(domain.edge.uses_gate.componentInstance_gateInstanceRef.constants.LABEL)
    .id()
}

async function areRequirementsProvided({ g, rootInstanceVertexId, requirements = [], stateEdgeCache, pathResolutionCache }) {
  if (!requirements?.length) return true
  for (const targetNodeId of requirements) {
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

async function resolveDependencyComponentId({ g, depNodeId, depType }) {
  if (depType === 'task') {
    const [depComponentId] = await g.V(depNodeId).in(domain.edge.has_task.component_task.constants.LABEL).id()
    return depComponentId
  }
  if (depType === 'data') {
    const [depComponentId] = await g.V(depNodeId).in(domain.edge.has_data.component_data.constants.LABEL).id()
    return depComponentId
  }
  return null
}

async function buildGateDependencyPayload({
  g,
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
      g,
      rootInstanceVertexId,
      targetNodeId: depNodeId,
      stateEdgeCache,
    })
    if (!stateEdgeInfo) continue

    const [depValues] = await g.V(depNodeId).valueMap('label', 'name')
    const depLabelValues = depValues?.label ?? depValues
    const depType = vertexLabelToType(Array.isArray(depLabelValues) ? depLabelValues[0] : depLabelValues)
    const depNameValues = depValues?.name ?? depValues
    const depName = Array.isArray(depNameValues) ? depNameValues[0] : depNameValues
    if (!depType || !depName) continue

    const depComponentId = await resolveDependencyComponentId({ g, depNodeId, depType })
    const importPathCacheKey = `${dependentComponentId}:${depComponentId}`
    let aliasPath = []
    if (depComponentId && dependentComponentId && depComponentId !== dependentComponentId) {
      if (importPathCache.has(importPathCacheKey)) {
        aliasPath = importPathCache.get(importPathCacheKey) ?? []
      } else {
        aliasPath = await findImportPathBetweenComponents({
          g,
          fromComponentId: dependentComponentId,
          toComponentId: depComponentId,
        }) ?? []
        importPathCache.set(importPathCacheKey, aliasPath)
      }
    }

    const [stateValues] = await g.E(stateEdgeInfo.stateEdgeId).valueMap('result')
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
  componentHash,
  name,
  deps,
}) {
  const subject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('component')
    .channel('exec')
    .action('compute_result')
    .version('v1')
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

async function getParentContext({ g, parentInstanceVertexId }) {
  const [instanceValues] = await g.V(parentInstanceVertexId).valueMap('instanceId')
  const parentInstanceId = pickFirst(instanceValues?.instanceId ?? instanceValues)
  if (!parentInstanceId) return null

  const [dependentComponentId] = await g
    .V(parentInstanceVertexId)
    .out(domain.edge.instance_of.componentInstance_component.constants.LABEL)
    .id()
  if (!dependentComponentId) return null

  const [componentValues] = await g.V(dependentComponentId).valueMap('hash')
  const componentHash = pickFirst(componentValues?.hash ?? componentValues)
  if (!componentHash) return null

  return { parentInstanceId, dependentComponentId, componentHash }
}

async function loadGateRefsForParent({
  g,
  parentInstanceVertexId,
  gateInstanceVertexId,
}) {
  const gateRefs = []
  const gateRefInstanceIds = await g
    .V(parentInstanceVertexId)
    .out(domain.edge.uses_gate.componentInstance_gateInstanceRef.constants.LABEL)
    .filter(_ => _.out(domain.edge.uses_gate.gateInstanceRef_componentInstance.constants.LABEL).has('id', gateInstanceVertexId))
    .id()

  for (const gateRefInstanceId of gateRefInstanceIds ?? []) {
    const [gateRefId] = await g
      .V(gateRefInstanceId)
      .out(domain.edge.uses_gate.gateInstanceRef_gateRef.constants.LABEL)
      .id()
    const [gateRefValues] = gateRefId
      ? await g.V(gateRefId).valueMap('alias', 'name')
      : []
    const aliasValues = gateRefValues?.alias ?? gateRefValues
    const alias = pickFirst(aliasValues)
    const nameValues = gateRefValues?.name ?? gateRefValues
    const name = alias ?? pickFirst(nameValues)
    if (!gateRefId || !name) continue

    const taskWaitForIds = await g.V(gateRefId).out(domain.edge.wait_for.gateRef_task.constants.LABEL).id()
    const dataWaitForIds = await g.V(gateRefId).out(domain.edge.wait_for.gateRef_data.constants.LABEL).id()
    const depsTaskIds = await g.V(gateRefId).out(domain.edge.has_dependency.gateRef_task.constants.LABEL).id()
    const depsDataIds = await g.V(gateRefId).out(domain.edge.has_dependency.gateRef_data.constants.LABEL).id()

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

export async function handler({ rootCtx: { natsContext, g }, scope: { instanceId, parentInstanceId } }) {
  if (!instanceId || !g) return

  const gateInstanceVertexId = await resolveInstanceVertexId({ g, instanceId })
  if (!gateInstanceVertexId) return

  const alreadyRunning = await hasInstanceStarted({ g, instanceVertexId: gateInstanceVertexId })
  if (alreadyRunning) return

  const parentInstanceVertexIds = await resolveParentInstanceVertexIds({
    g,
    gateInstanceVertexId,
    parentInstanceId,
  })
  if (!parentInstanceVertexIds?.length) return

  const stateEdgeCache = new Map()
  const pathResolutionCache = new Map()
  const importPathCache = new Map()

  for (const parentInstanceVertexId of new Set(parentInstanceVertexIds)) {
    if (!parentInstanceVertexId) continue
    const parentContext = await getParentContext({ g, parentInstanceVertexId })
    if (!parentContext) continue

    const gateRefs = await loadGateRefsForParent({
      g,
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
        g,
        rootInstanceVertexId: parentInstanceVertexId,
        requirements,
        stateEdgeCache,
        pathResolutionCache,
      })
      if (!ready) continue

      const gateDeps = await buildGateDependencyPayload({
        g,
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
      })
    }
  }
}
