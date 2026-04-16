import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

import { Errors } from '../../../../errors.js'
import { domain } from '@liquid-bricks/spec-domain/domain'
import { STATE_EDGE_LABEL_BY_TYPE } from '../constants.js'

const INJECTS_INTO_EDGE_BY_TYPE = Object.freeze({
  data: [
    { edgeLabel: domain.edge.injects_into.data_data.constants.LABEL, targetType: 'data' },
    { edgeLabel: domain.edge.injects_into.data_task.constants.LABEL, targetType: 'task' },
  ],
  task: [
    { edgeLabel: domain.edge.injects_into.task_data.constants.LABEL, targetType: 'data' },
    { edgeLabel: domain.edge.injects_into.task_task.constants.LABEL, targetType: 'task' },
  ],
})

async function findComponentIdForNode({ g, nodeId, type }) {
  const edgeLabel = type === 'task'
    ? domain.edge.has_task.component_task.constants.LABEL
    : domain.edge.has_data.component_data.constants.LABEL
  const [componentId] = await g.V(nodeId).in(edgeLabel).id()
  return componentId
}

async function findNodeName({ g, nodeId }) {
  const [values] = await g.V(nodeId).valueMap('name')
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

async function findImportPath({ g, fromComponentId, toComponentId }) {
  const visited = new Set()
  const queue = [{ componentId: fromComponentId, path: [] }]

  while (queue.length) {
    const { componentId, path } = queue.shift()
    if (componentId === toComponentId) return path
    if (visited.has(componentId)) continue
    visited.add(componentId)

    const importRefIds = await g.V(componentId)
      .out(domain.edge.has_import.component_importRef.constants.LABEL)
      .id()

    for (const importRefId of importRefIds ?? []) {
      const [edgeValues] = await g.V(importRefId).valueMap('alias')
      const aliasValues = edgeValues?.alias ?? edgeValues
      const alias = Array.isArray(aliasValues) ? aliasValues[0] : aliasValues
      const [nextComponentId] = await g
        .V(importRefId)
        .out(domain.edge.import_of.importRef_component.constants.LABEL)
        .id()
      if (!alias || !nextComponentId) continue
      queue.push({ componentId: nextComponentId, path: [...path, alias] })
    }

    const gateRefIds = await g.V(componentId)
      .out(domain.edge.has_gate.component_gateRef.constants.LABEL)
      .id()
    for (const gateRefId of gateRefIds ?? []) {
      const [edgeValues] = await g.V(gateRefId).valueMap('alias')
      const aliasValues = edgeValues?.alias ?? edgeValues
      const alias = Array.isArray(aliasValues) ? aliasValues[0] : aliasValues
      const [nextComponentId] = await g
        .V(gateRefId)
        .out(domain.edge.gate_of.gateRef_component.constants.LABEL)
        .id()
      if (!alias || !nextComponentId) continue
      queue.push({ componentId: nextComponentId, path: [...path, alias] })
    }
  }
  return null
}

async function findInstanceForImportPath({ g, rootInstanceVertexId, aliasPath }) {
  let currentInstanceVertexId = rootInstanceVertexId
  for (const alias of aliasPath ?? []) {
    const [importInstanceRefId] = await g
      .V(currentInstanceVertexId)
      .out(domain.edge.uses_import.componentInstance_importInstanceRef.constants.LABEL)
      .filter(_ => _.out(domain.edge.uses_import.importInstanceRef_importRef.constants.LABEL).has('alias', alias))
      .id()
    const [gateInstanceRefId] = importInstanceRefId ? [] : await g
      .V(currentInstanceVertexId)
      .out(domain.edge.uses_gate.componentInstance_gateInstanceRef.constants.LABEL)
      .filter(_ => _.out(domain.edge.uses_gate.gateInstanceRef_gateRef.constants.LABEL).has('alias', alias))
      .id()
    const refId = importInstanceRefId ?? gateInstanceRefId
    if (!refId) return null
    const [nextInstanceVertexId] = await g
      .V(refId)
      .out(importInstanceRefId ? domain.edge.uses_import.importInstanceRef_componentInstance.constants.LABEL : domain.edge.uses_gate.gateInstanceRef_componentInstance.constants.LABEL)
      .id()
    if (!nextInstanceVertexId) return null
    currentInstanceVertexId = nextInstanceVertexId
  }
  return currentInstanceVertexId
}

async function findComponentIdForInstance({ g, instanceVertexId }) {
  const [componentId] = await g
    .V(instanceVertexId)
    .out(domain.edge.instance_of.componentInstance_component.constants.LABEL)
    .id()
  return componentId
}

async function findParentInstanceVertexId({ g, instanceVertexId }) {
  const [parentImportId] = await g.V(instanceVertexId)
    .in(domain.edge.uses_import.importInstanceRef_componentInstance.constants.LABEL)
    .in(domain.edge.uses_import.componentInstance_importInstanceRef.constants.LABEL)
    .id()
  if (parentImportId) return parentImportId

  const [parentGateId] = await g.V(instanceVertexId)
    .in(domain.edge.uses_gate.gateInstanceRef_componentInstance.constants.LABEL)
    .in(domain.edge.uses_gate.componentInstance_gateInstanceRef.constants.LABEL)
    .id()
  return parentGateId ?? null
}

async function findInstanceForAliasPathInAncestors({ g, instanceVertexId, aliasPath, targetComponentId }) {
  let currentInstanceId = instanceVertexId
  while (currentInstanceId) {
    const resolvedInstanceVertexId = await findInstanceForImportPath({
      g,
      rootInstanceVertexId: currentInstanceId,
      aliasPath,
    })
    if (resolvedInstanceVertexId) {
      const resolvedComponentId = await findComponentIdForInstance({
        g,
        instanceVertexId: resolvedInstanceVertexId,
      })
      if (!targetComponentId || resolvedComponentId === targetComponentId) {
        return { resolvedInstanceVertexId, importRootInstanceVertexId: currentInstanceId }
      }
    }

    currentInstanceId = await findParentInstanceVertexId({ g, instanceVertexId: currentInstanceId })
  }

  return { resolvedInstanceVertexId: null, importRootInstanceVertexId: null }
}

async function findRootInstanceVertexId({ g, instanceVertexId }) {
  let current = instanceVertexId
  while (true) {
    const parentInstanceVertexId = await findParentInstanceVertexId({ g, instanceVertexId: current })
    if (!parentInstanceVertexId) break
    current = parentInstanceVertexId
  }
  return current
}

async function findRootComponentContext({ g, handlerDiagnostics, instanceVertexId, instanceId }) {
  const rootInstanceVertexId = await findRootInstanceVertexId({ g, instanceVertexId })
  const [rootComponentId] = await g
    .V(rootInstanceVertexId)
    .out(domain.edge.instance_of.componentInstance_component.constants.LABEL)
    .id()

  handlerDiagnostics.require(
    rootComponentId,
    Errors.PRECONDITION_INVALID,
    `Root component missing for instance ${instanceId}`,
    { instanceId },
  )

  return { rootInstanceVertexId, rootComponentId }
}

async function findStateEdgeForNode({ g, stateMachineId, targetNodeId, targetStateEdgeLabel }) {
  const [stateEdgeId] = await g
    .V(stateMachineId)
    .outE(targetStateEdgeLabel)
    .filter(_ => _.inV().has('id', targetNodeId))
    .id()
  return stateEdgeId
}

export async function publishInjectedResultComputedEvents({ scope, rootCtx: { g, natsContext } }) {
  const { handlerDiagnostics, instanceId, instanceVertexId, stateMachineId, stateEdgeId, stateEdgeLabel, type, result } = scope

  const [providedNodeId] = await g
    .V(stateMachineId)
    .outE(stateEdgeLabel)
    .has('id', stateEdgeId)
    .inV()
    .id()

  handlerDiagnostics.require(
    providedNodeId,
    Errors.PRECONDITION_INVALID,
    `${type} state edge ${stateEdgeId} not associated with instance ${instanceId}`,
    { instanceId, stateEdgeId, type }
  )

  const providedComponentId = await findComponentIdForNode({ g, nodeId: providedNodeId, type })
  handlerDiagnostics.require(
    providedComponentId,
    Errors.PRECONDITION_INVALID,
    `Provided component missing`,
    { instanceId, stateEdgeId, type }
  )

  const fromName = await findNodeName({ g, nodeId: providedNodeId })

  const injectsIntoEdges = INJECTS_INTO_EDGE_BY_TYPE[type]
  if (!injectsIntoEdges?.length) return

  const resultComputedSubject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('componentInstance')
    .channel('evt')
    .action('result_computed')
    .version('v1')
    .build()

  const publishedTargets = new Set()
  let rootContext = null

  for (const { edgeLabel, targetType } of injectsIntoEdges) {
    const targetEdgeIds = await g.V(providedNodeId).outE(edgeLabel).id()
    if (!targetEdgeIds?.length) continue

    const targetStateEdgeLabel = STATE_EDGE_LABEL_BY_TYPE[targetType]

    for (const targetEdgeId of targetEdgeIds) {
      const [targetNodeId] = await g.E(targetEdgeId).inV().id()
      if (!targetNodeId) continue
      const [targetEdgeValues] = await g.E(targetEdgeId).valueMap('targetAliasPath')
      const targetAliasPathValues = targetEdgeValues?.targetAliasPath ?? targetEdgeValues
      const targetAliasPathRaw = Array.isArray(targetAliasPathValues) ? targetAliasPathValues[0] : targetAliasPathValues
      const targetAliasPath = normalizeAliasPath(targetAliasPathRaw)

      const targetName = await findNodeName({ g, nodeId: targetNodeId })
      let targetInstanceId = null
      const targetComponentId = await findComponentIdForNode({ g, nodeId: targetNodeId, type: targetType })

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
            g,
            instanceVertexId,
            aliasPath: targetAliasPath,
            targetComponentId,
          })
          resolvedInstanceVertexId = aliasPathResolution.resolvedInstanceVertexId
          importRootInstanceVertexId = aliasPathResolution.importRootInstanceVertexId ?? importRootInstanceVertexId

          if (!resolvedInstanceVertexId) {
            if (!rootContext) {
              rootContext = await findRootComponentContext({ g, handlerDiagnostics, instanceVertexId, instanceId })
            }
            importRootInstanceVertexId = rootContext.rootInstanceVertexId
            resolvedInstanceVertexId = await findInstanceForImportPath({
              g,
              rootInstanceVertexId: importRootInstanceVertexId,
              aliasPath: importPath,
            })
          }
        }

        if (!resolvedInstanceVertexId) {
          importPath = await findImportPath({
            g,
            fromComponentId: providedComponentId,
            toComponentId: targetComponentId,
          })

          if (!importPath) {
            if (!rootContext) {
              rootContext = await findRootComponentContext({ g, handlerDiagnostics, instanceVertexId, instanceId })
            }
            importRootInstanceVertexId = rootContext.rootInstanceVertexId
            importPath = await findImportPath({
              g,
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
            g,
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

      const [targetInstanceMap] = await g.V(targetInstanceVertexId).valueMap('instanceId')
      const targetInstanceValues = targetInstanceMap?.instanceId ?? targetInstanceMap
      targetInstanceId = Array.isArray(targetInstanceValues) ? targetInstanceValues[0] : targetInstanceValues

      handlerDiagnostics.require(
        targetInstanceId,
        Errors.PRECONDITION_INVALID,
        `Injected target instanceId missing`,
        buildDiagnostics({ targetInstanceVertexId, importPath, targetAliasPath })
      )

      const [targetStateMachineId] = await g
        .V(targetInstanceVertexId)
        .out(domain.edge.has_stateMachine.componentInstance_stateMachine.constants.LABEL)
        .id()

      handlerDiagnostics.require(
        targetStateMachineId,
        Errors.PRECONDITION_INVALID,
        `Injected target stateMachine missing`,
        buildDiagnostics({ targetInstanceVertexId })
      )

      const targetStateEdgeId = await findStateEdgeForNode({
        g,
        stateMachineId: targetStateMachineId,
        targetNodeId,
        targetStateEdgeLabel,
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

      await natsContext.publish(
        resultComputedSubject,
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
