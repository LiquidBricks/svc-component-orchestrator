import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { Errors } from '../../../../../errors.js'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


async function listInjectedTargetEdgeIds({ dataMapper, fromType, targetType, vertexId }) {
  if (fromType === 'data' && targetType === 'data') {
    return dataMapper.query.listDataToDataInjectionEdgeIds({ vertexId })
  }
  if (fromType === 'data' && targetType === 'task') {
    return dataMapper.query.listDataToTaskInjectionEdgeIds({ vertexId })
  }
  if (fromType === 'task' && targetType === 'data') {
    return dataMapper.query.listTaskToDataInjectionEdgeIds({ vertexId })
  }
  if (fromType === 'task' && targetType === 'task') {
    return dataMapper.query.listTaskToTaskInjectionEdgeIds({ vertexId })
  }
  return []
}

async function findComponentIdForNode({ g, dataMapper, nodeId, type }) {
  if (type === 'task') {
    const [componentId] = await dataMapper.query.findComponentIdForTask({ vertexId: nodeId })
    return componentId
  }

  const [componentId] = await dataMapper.query.findComponentIdForData({ vertexId: nodeId })
  return componentId
}

async function findNodeName({ g, dataMapper, nodeId }) {
  const [values] = await dataMapper.query.readNodeName({ vertexId: nodeId })
  const nameValues = values?.name ?? values
  return Array.isArray(nameValues) ? nameValues[0] : nameValues
}

function normalizeAliasPath(value) {
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean)
  }
  if (typeof value !== 'string') return []

  const trimmed = value.trim()
  if (!trimmed) return []

  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => String(entry).trim()).filter(Boolean)
    }
  } catch {
    // ignore and fallback to dot notation parsing
  }

  return trimmed.split('.').filter(Boolean)
}

async function findImportPath({ g, dataMapper, fromComponentId, toComponentId }) {
  const visited = new Set()
  const queue = [{ componentId: fromComponentId, path: [] }]

  while (queue.length) {
    const { componentId, path } = queue.shift()
    if (componentId === toComponentId) return path
    if (visited.has(componentId)) continue
    visited.add(componentId)

    const importRefIds = await dataMapper.query.listImportRefIds({ vertexId: componentId })

    for (const importRefId of importRefIds ?? []) {
      const [edgeValues] = await dataMapper.query.readImportRefAlias({ vertexId: importRefId })
      const aliasValues = edgeValues?.alias ?? edgeValues
      const alias = Array.isArray(aliasValues) ? aliasValues[0] : aliasValues
      const [nextComponentId] = await dataMapper.query.findImportedComponentIdForImportRef({ vertexId: importRefId })
      if (!alias || !nextComponentId) continue
      queue.push({ componentId: nextComponentId, path: [...path, alias] })
    }

    const gateRefIds = await dataMapper.query.listGateRefIds({ vertexId: componentId })
    for (const gateRefId of gateRefIds ?? []) {
      const [edgeValues] = await dataMapper.query.readGateRefAlias({ vertexId: gateRefId })
      const aliasValues = edgeValues?.alias ?? edgeValues
      const alias = Array.isArray(aliasValues) ? aliasValues[0] : aliasValues
      const [nextComponentId] = await dataMapper.query.findGatedComponentIdForGateRef({ vertexId: gateRefId })
      if (!alias || !nextComponentId) continue
      queue.push({ componentId: nextComponentId, path: [...path, alias] })
    }
  }
  return null
}

async function findInstanceForImportPath({ g, dataMapper, rootInstanceVertexId, aliasPath }) {
  let currentInstanceVertexId = rootInstanceVertexId
  for (const alias of aliasPath ?? []) {
    const [importInstanceRefId] = await dataMapper.query.findImportInstanceRefIdByAlias({ vertexId: currentInstanceVertexId, alias })
    if (importInstanceRefId) {
      const [nextInstanceVertexId] = await dataMapper.query.findImportedInstanceVertexIdForRef({ vertexId: importInstanceRefId })
      if (!nextInstanceVertexId) return null
      currentInstanceVertexId = nextInstanceVertexId
      continue
    }

    const [gateInstanceRefId] = await dataMapper.query.findGateInstanceRefIdByAlias({ vertexId: currentInstanceVertexId, alias })
    if (!gateInstanceRefId) return null
    const [nextInstanceVertexId] = await dataMapper.query.findGatedInstanceVertexIdForRef({ vertexId: gateInstanceRefId })
    if (!nextInstanceVertexId) return null
    currentInstanceVertexId = nextInstanceVertexId
  }
  return currentInstanceVertexId
}

async function findComponentIdForInstance({ g, dataMapper, instanceVertexId }) {
  const [componentId] = await dataMapper.query.findComponentIdForInstance({ vertexId: instanceVertexId })
  return componentId
}

async function findParentInstanceVertexId({ g, dataMapper, instanceVertexId }) {
  const [parentImportId] = await dataMapper.query.findParentImportId({ vertexId: instanceVertexId })
  if (parentImportId) return parentImportId

  const [parentGateId] = await dataMapper.query.findParentGateId({ vertexId: instanceVertexId })
  return parentGateId ?? null
}

async function findInstanceForAliasPathInAncestors({ g, dataMapper, instanceVertexId, aliasPath, targetComponentId }) {
  let currentInstanceId = instanceVertexId
  while (currentInstanceId) {
    const resolvedInstanceVertexId = await findInstanceForImportPath({
      g, dataMapper,
      rootInstanceVertexId: currentInstanceId,
      aliasPath,
    })
    if (resolvedInstanceVertexId) {
      const resolvedComponentId = await findComponentIdForInstance({
        g, dataMapper,
        instanceVertexId: resolvedInstanceVertexId,
      })
      if (!targetComponentId || resolvedComponentId === targetComponentId) {
        return { resolvedInstanceVertexId, importRootInstanceVertexId: currentInstanceId }
      }
    }

    currentInstanceId = await findParentInstanceVertexId({ g, dataMapper, instanceVertexId: currentInstanceId })
  }

  return { resolvedInstanceVertexId: null, importRootInstanceVertexId: null }
}

async function findRootInstanceVertexId({ g, dataMapper, instanceVertexId }) {
  let current = instanceVertexId
  while (true) {
    const parentInstanceVertexId = await findParentInstanceVertexId({ g, dataMapper, instanceVertexId: current })
    if (!parentInstanceVertexId) break
    current = parentInstanceVertexId
  }
  return current
}

async function findRootComponentContext({ g, dataMapper, handlerDiagnostics, instanceVertexId, instanceId }) {
  const rootInstanceVertexId = await findRootInstanceVertexId({ g, dataMapper, instanceVertexId })
  const [rootComponentId] = await dataMapper.query.findComponentIdForInstance({ vertexId: rootInstanceVertexId })

  handlerDiagnostics.require(
    rootComponentId,
    Errors.PRECONDITION_INVALID,
    `Root component missing for instance ${instanceId}`,
    { instanceId },
  )

  return { rootInstanceVertexId, rootComponentId }
}

async function findStateEdgeForNode({ g, dataMapper, stateMachineId, targetNodeId, targetType }) {
  const [stateEdgeId] = targetType === 'task'
    ? await dataMapper.query.findTaskStateEdgeIdForTargetNode({ vertexId: stateMachineId, id: targetNodeId })
    : await dataMapper.query.findDataStateEdgeIdForTargetNode({ vertexId: stateMachineId, id: targetNodeId })
  return stateEdgeId
}

export async function publishInjectedComputeResultDoneEvents({ scope, rootCtx: { g, dataMapper, natsContext } }) {
  const { handlerDiagnostics, instanceId, instanceVertexId, stateMachineId, stateEdgeId, type, result } = scope

  const [providedNodeId] = type === 'task'
    ? await dataMapper.query.findTaskStateEdgeTargetNodeId({ id: stateEdgeId, vertexId: stateMachineId })
    : await dataMapper.query.findDataStateEdgeTargetNodeId({ id: stateEdgeId, vertexId: stateMachineId })

  handlerDiagnostics.require(
    providedNodeId,
    Errors.PRECONDITION_INVALID,
    `${type} state edge ${stateEdgeId} not associated with instance ${instanceId}`,
    { instanceId, stateEdgeId, type }
  )

  const providedComponentId = await findComponentIdForNode({ g, dataMapper, nodeId: providedNodeId, type })
  handlerDiagnostics.require(
    providedComponentId,
    Errors.PRECONDITION_INVALID,
    `Provided component missing`,
    { instanceId, stateEdgeId, type }
  )

  const fromName = await findNodeName({ g, dataMapper, nodeId: providedNodeId })

  const targetTypes = ['data', 'task']

  const publishedTargets = new Set()
  let rootContext = null

  for (const targetType of targetTypes) {
    const targetEdgeIds = await listInjectedTargetEdgeIds({ dataMapper, fromType: type, targetType, vertexId: providedNodeId })
    if (!targetEdgeIds?.length) continue

    for (const targetEdgeId of targetEdgeIds) {
      const [targetNodeId] = await dataMapper.query.findEdgeTargetNodeId({ edgeId: targetEdgeId })
      if (!targetNodeId) continue
      const [targetEdgeValues] = await dataMapper.query.readTargetEdgeValues({ edgeId: targetEdgeId })
      const targetAliasPathValues = targetEdgeValues?.targetAliasPath ?? targetEdgeValues
      const targetAliasPathRaw = Array.isArray(targetAliasPathValues) ? targetAliasPathValues[0] : targetAliasPathValues
      const targetAliasPath = normalizeAliasPath(targetAliasPathRaw)

      const targetName = await findNodeName({ g, dataMapper, nodeId: targetNodeId })
      let targetInstanceId = null
      const targetComponentId = await findComponentIdForNode({ g, dataMapper, nodeId: targetNodeId, type: targetType })

      const buildDiagnostics = (additional = {}) => ({
        from: { instanceId, type, name: fromName },
        target: { instanceId: targetInstanceId, type: targetType, name: targetName },
        ...additional,
      })

      handlerDiagnostics.require(
        targetComponentId,
        Errors.PRECONDITION_INVALID,
        `Injected target component missing`,
        buildDiagnostics()
      )

      let targetInstanceVertexId = instanceVertexId
      let importPath = []
      let importRootInstanceVertexId = instanceVertexId

      if (targetComponentId !== providedComponentId) {
        let resolvedInstanceVertexId = null
        if (targetAliasPath.length) {
          importPath = targetAliasPath
          const aliasPathResolution = await findInstanceForAliasPathInAncestors({
            g, dataMapper,
            instanceVertexId,
            aliasPath: targetAliasPath,
            targetComponentId,
          })
          resolvedInstanceVertexId = aliasPathResolution.resolvedInstanceVertexId
          importRootInstanceVertexId = aliasPathResolution.importRootInstanceVertexId ?? importRootInstanceVertexId

          if (!resolvedInstanceVertexId) {
            if (!rootContext) {
              rootContext = await findRootComponentContext({ g, dataMapper, handlerDiagnostics, instanceVertexId, instanceId })
            }
            importRootInstanceVertexId = rootContext.rootInstanceVertexId
            resolvedInstanceVertexId = await findInstanceForImportPath({
              g, dataMapper,
              rootInstanceVertexId: importRootInstanceVertexId,
              aliasPath: importPath,
            })
          }
        }

        if (!resolvedInstanceVertexId) {
          importPath = await findImportPath({
            g, dataMapper,
            fromComponentId: providedComponentId,
            toComponentId: targetComponentId,
          })

          if (!importPath) {
            if (!rootContext) {
              rootContext = await findRootComponentContext({ g, dataMapper, handlerDiagnostics, instanceVertexId, instanceId })
            }
            importRootInstanceVertexId = rootContext.rootInstanceVertexId
            importPath = await findImportPath({
              g, dataMapper,
              fromComponentId: rootContext.rootComponentId,
              toComponentId: targetComponentId,
            })
          }

          if (!importPath) {
            handlerDiagnostics.warn(
              false,
              Errors.PRECONDITION_INVALID,
              `Skipping injected target component not reachable via imports`,
              buildDiagnostics({ importPath, targetAliasPath })
            )
            continue
          }

          resolvedInstanceVertexId = await findInstanceForImportPath({
            g, dataMapper,
            rootInstanceVertexId: importRootInstanceVertexId,
            aliasPath: importPath,
          })
        }

        handlerDiagnostics.require(
          resolvedInstanceVertexId,
          Errors.PRECONDITION_INVALID,
          `Injected target instance missing for import path`,
          buildDiagnostics({ importPath, targetAliasPath })
        )

        targetInstanceVertexId = resolvedInstanceVertexId
      }

      const [targetInstanceMap] = await dataMapper.query.readTargetInstanceMap({ vertexId: targetInstanceVertexId })
      const targetInstanceValues = targetInstanceMap?.instanceId ?? targetInstanceMap
      targetInstanceId = Array.isArray(targetInstanceValues) ? targetInstanceValues[0] : targetInstanceValues

      handlerDiagnostics.require(
        targetInstanceId,
        Errors.PRECONDITION_INVALID,
        `Injected target instanceId missing`,
        buildDiagnostics({ targetInstanceVertexId, importPath, targetAliasPath })
      )

      const [targetStateMachineId] = await dataMapper.query.readTargetStateMachineId({ vertexId: targetInstanceVertexId })

      handlerDiagnostics.require(
        targetStateMachineId,
        Errors.PRECONDITION_INVALID,
        `Injected target stateMachine missing`,
        buildDiagnostics({ targetInstanceVertexId })
      )

      const targetStateEdgeId = await findStateEdgeForNode({
        g, dataMapper,
        stateMachineId: targetStateMachineId,
        targetNodeId,
        targetType,
      })
      handlerDiagnostics.require(
        targetStateEdgeId,
        Errors.PRECONDITION_INVALID,
        `Injected target ${targetType} not associated with instance ${targetInstanceId}`,
        buildDiagnostics({ targetStateMachineId })
      )

      const targetKey = `${targetInstanceId}:${targetStateEdgeId}`
      if (publishedTargets.has(targetKey) || (targetInstanceId === instanceId && targetStateEdgeId === stateEdgeId)) continue
      publishedTargets.add(targetKey)

      handlerDiagnostics.require(
        typeof targetName === 'string' && targetName.length,
        Errors.PRECONDITION_INVALID,
        `Injected target name missing`,
        buildDiagnostics({ targetStateEdgeId })
      )

      const computeFunctionSubject = createBasicSubject(
        natsEvents['*'].component_service['*'].function_result.evt.component.compute_function.v1[targetType],
      ).forPublish().env('prod').build()

      await natsContext.publish(
        computeFunctionSubject,
        JSON.stringify({
          data: {
            instanceId: targetInstanceId,
            stateId: targetStateEdgeId,
            name: targetName,
            type: targetType,
            result,
          }
        })
      )
    }
  }
}
