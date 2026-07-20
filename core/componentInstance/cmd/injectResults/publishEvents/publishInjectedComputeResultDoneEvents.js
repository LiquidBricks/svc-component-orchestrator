import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { Errors } from '../../../../../errors.js'

function computeFunctionSubjectForTargetType(emits, targetType) {
  let subject
  switch (targetType) {
    case 'data':
      subject = emits['component_service.function_result.evt.component.compute_function.v1.data']
      break
    case 'task':
      subject = emits['component_service.function_result.evt.component.compute_function.v1.task']
      break
    default:
      throw new TypeError('Unsupported injected compute_function target type: ' + targetType)
  }

  return createBasicSubject(subject)
    .forPublish()
    .env('prod')
    .build()
}

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

async function findRouteOwnerInstance({
  g,
  dataMapper,
  instanceVertexId,
  ownerComponentId,
  sourceAliasPath,
}) {
  let candidateInstanceVertexId = instanceVertexId

  while (candidateInstanceVertexId) {
    const candidateComponentId = await findComponentIdForInstance({
      g,
      dataMapper,
      instanceVertexId: candidateInstanceVertexId,
    })
    if (candidateComponentId === ownerComponentId) {
      const resolvedSourceInstanceVertexId = await findInstanceForImportPath({
        g,
        dataMapper,
        rootInstanceVertexId: candidateInstanceVertexId,
        aliasPath: sourceAliasPath,
      })
      if (resolvedSourceInstanceVertexId === instanceVertexId) {
        return candidateInstanceVertexId
      }
    }

    candidateInstanceVertexId = await findParentInstanceVertexId({
      g,
      dataMapper,
      instanceVertexId: candidateInstanceVertexId,
    })
  }

  return null
}

async function findStateEdgeForNode({ g, dataMapper, stateMachineId, targetNodeId, targetType }) {
  const [stateEdgeId] = targetType === 'task'
    ? await dataMapper.query.findTaskStateEdgeIdForTargetNode({ vertexId: stateMachineId, id: targetNodeId })
    : await dataMapper.query.findDataStateEdgeIdForTargetNode({ vertexId: stateMachineId, id: targetNodeId })
  return stateEdgeId
}

function indexedSourceMatches({ source, instanceId, instanceVertexId, stateMachineId, stateEdgeId, type }) {
  return Boolean(
    source
    && source.instanceId === instanceId
    && source.instanceVertexId === instanceVertexId
    && source.stateMachineId === stateMachineId
    && source.stateEdgeId === stateEdgeId
    && source.type === type
    && source.nodeId
  )
}

function indexedTargetIsValid(target) {
  return Boolean(
    target
    && target.instanceId
    && target.instanceVertexId
    && target.stateMachineId
    && target.stateEdgeId
    && target.nodeId
    && (target.type === 'data' || target.type === 'task')
    && typeof target.name === 'string'
    && target.name.length
  )
}

async function publishIndexedTargets({
  natsContext,
  emits,
  source,
  targets,
  result,
}) {
  const publishedTargets = new Set()

  for (const target of targets ?? []) {
    const targetKey = `${target.instanceId}:${target.stateEdgeId}`
    if (
      publishedTargets.has(targetKey)
      || (target.instanceId === source.instanceId && target.stateEdgeId === source.stateEdgeId)
    ) continue
    publishedTargets.add(targetKey)

    await natsContext.publish(
      computeFunctionSubjectForTargetType(emits, target.type),
      JSON.stringify({
        data: {
          instanceId: target.instanceId,
          stateId: target.stateEdgeId,
          name: target.name,
          type: target.type,
          result,
        }
      })
    )
  }
}

export async function publishInjectedComputeResultDoneEvents({
  scope,
  rootCtx: { g, dataMapper, natsContext },
  routeCtx: { emits },
}) {
  const { handlerDiagnostics, instanceId, instanceVertexId, stateMachineId, stateEdgeId, type, result } = scope

  let indexedRouting = { found: false }
  try {
    indexedRouting = await dataMapper.vertex.componentInstance.index.injectionRouting.lookup({
      instanceVertexId,
      stateEdgeId,
    })
  } catch (error) {
    handlerDiagnostics.warn(
      false,
      Errors.COMPONENT_INSTANCE_INDEX_LOOKUP_FAILED,
      'Unable to read component instance injection routing index; canonical fallback remains active',
      { instanceId, instanceVertexId, stateEdgeId, error },
    )
  }

  if (indexedRouting.found) {
    const sourceMatches = indexedSourceMatches({
      source: indexedRouting.source,
      instanceId,
      instanceVertexId,
      stateMachineId,
      stateEdgeId,
      type,
    })
    const targetsAreValid = Array.isArray(indexedRouting.targets)
      && indexedRouting.targets.every(indexedTargetIsValid)

    if (sourceMatches && targetsAreValid) {
      await publishIndexedTargets({
        natsContext,
        emits,
        source: indexedRouting.source,
        targets: indexedRouting.targets,
        result,
      })
      return
    }

    handlerDiagnostics.warn(
      false,
      Errors.COMPONENT_INSTANCE_INDEX_LOOKUP_FAILED,
      'Component instance injection routing index is stale or invalid; canonical fallback remains active',
      {
        expected: { instanceId, instanceVertexId, stateMachineId, stateEdgeId, type },
        indexedRouting,
      },
    )
  }

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

  for (const targetType of targetTypes) {
    const targetEdgeIds = await listInjectedTargetEdgeIds({ dataMapper, fromType: type, targetType, vertexId: providedNodeId })
    if (!targetEdgeIds?.length) continue

    for (const targetEdgeId of targetEdgeIds) {
      const [targetNodeId] = await dataMapper.query.findEdgeTargetNodeId({ edgeId: targetEdgeId })
      if (!targetNodeId) continue
      const [targetEdgeValues] = await dataMapper.query.readTargetEdgeValues({ edgeId: targetEdgeId })
      const ownerComponentIdValues = targetEdgeValues?.ownerComponentId
      const ownerComponentId = Array.isArray(ownerComponentIdValues)
        ? ownerComponentIdValues[0]
        : ownerComponentIdValues
      const sourceAliasPathValues = targetEdgeValues?.sourceAliasPath
      const sourceAliasPathRaw = Array.isArray(sourceAliasPathValues)
        ? sourceAliasPathValues[0]
        : sourceAliasPathValues
      const targetAliasPathValues = targetEdgeValues?.targetAliasPath ?? targetEdgeValues
      const targetAliasPathRaw = Array.isArray(targetAliasPathValues) ? targetAliasPathValues[0] : targetAliasPathValues
      const sourceAliasPath = normalizeAliasPath(sourceAliasPathRaw)
      const targetAliasPath = normalizeAliasPath(targetAliasPathRaw)

      const targetName = await findNodeName({ g, dataMapper, nodeId: targetNodeId })
      let targetInstanceId = null
      const targetComponentId = await findComponentIdForNode({ g, dataMapper, nodeId: targetNodeId, type: targetType })

      const buildDiagnostics = (additional = {}) => ({
        from: { instanceId, type, name: fromName },
        target: { instanceId: targetInstanceId, type: targetType, name: targetName },
        ...additional,
      })

      if (
        typeof ownerComponentId !== 'string'
        || typeof sourceAliasPathRaw !== 'string'
        || typeof targetAliasPathRaw !== 'string'
      ) {
        handlerDiagnostics.warn(
          false,
          Errors.PRECONDITION_INVALID,
          'Skipping injection edge without canonical owner and alias provenance',
          buildDiagnostics({ targetEdgeId }),
        )
        continue
      }

      handlerDiagnostics.require(
        targetComponentId,
        Errors.PRECONDITION_INVALID,
        `Injected target component missing`,
        buildDiagnostics()
      )

      const ownerInstanceVertexId = await findRouteOwnerInstance({
        g,
        dataMapper,
        instanceVertexId,
        ownerComponentId,
        sourceAliasPath,
      })
      if (!ownerInstanceVertexId) continue

      const targetInstanceVertexId = await findInstanceForImportPath({
        g,
        dataMapper,
        rootInstanceVertexId: ownerInstanceVertexId,
        aliasPath: targetAliasPath,
      })
      handlerDiagnostics.require(
        targetInstanceVertexId,
        Errors.PRECONDITION_INVALID,
        'Injected target instance missing for canonical alias path',
        buildDiagnostics({ ownerComponentId, ownerInstanceVertexId, sourceAliasPath, targetAliasPath }),
      )

      const resolvedTargetComponentId = await findComponentIdForInstance({
        g,
        dataMapper,
        instanceVertexId: targetInstanceVertexId,
      })
      handlerDiagnostics.require(
        resolvedTargetComponentId === targetComponentId,
        Errors.PRECONDITION_INVALID,
        'Injected target instance does not match canonical route component',
        buildDiagnostics({
          ownerComponentId,
          ownerInstanceVertexId,
          sourceAliasPath,
          targetAliasPath,
          resolvedTargetComponentId,
        }),
      )

      const [targetInstanceMap] = await dataMapper.query.readTargetInstanceMap({ vertexId: targetInstanceVertexId })
      const targetInstanceValues = targetInstanceMap?.instanceId ?? targetInstanceMap
      targetInstanceId = Array.isArray(targetInstanceValues) ? targetInstanceValues[0] : targetInstanceValues

      handlerDiagnostics.require(
        targetInstanceId,
        Errors.PRECONDITION_INVALID,
        `Injected target instanceId missing`,
        buildDiagnostics({ targetInstanceVertexId, ownerComponentId, sourceAliasPath, targetAliasPath })
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

      await natsContext.publish(
        computeFunctionSubjectForTargetType(emits, targetType),
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
