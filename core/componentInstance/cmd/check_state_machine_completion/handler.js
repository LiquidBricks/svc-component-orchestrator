import { domain } from '@liquid-bricks/spec-domain/domain'

const DATA_PROVIDED_STATUS = domain.edge.has_data_state.stateMachine_data.constants.Status.PROVIDED
const TASK_PROVIDED_STATUS = domain.edge.has_task_state.stateMachine_task.constants.Status.PROVIDED
const GATE_PROVIDED_STATUS = domain.edge.has_gate_state.stateMachine_gateInstanceRef.constants.Status.PROVIDED

function pickFirst(values) {
  return Array.isArray(values) ? values[0] : values
}

function valueFor(values, key) {
  if (!values || typeof values !== 'object') return values
  const fieldValue = values[key]
  if (fieldValue === undefined) return undefined
  return pickFirst(fieldValue)
}

function normalizeResult(value) {
  if (typeof value !== 'string') return value ?? null

  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

async function areAllStatesProvided({ dataMapper, stateMachineId, stateStatusOverrides }) {
  const taskEdgeIds = await dataMapper.query.listTaskStateEdgeIds({ vertexId: stateMachineId }) ?? []
  const dataEdgeIds = await dataMapper.query.listDataStateEdgeIds({ vertexId: stateMachineId }) ?? []
  const stateEdges = [
    ...taskEdgeIds.map(edgeId => ({ edgeId, providedStatus: TASK_PROVIDED_STATUS })),
    ...dataEdgeIds.map(edgeId => ({ edgeId, providedStatus: DATA_PROVIDED_STATUS })),
  ]

  for (const { edgeId, providedStatus } of stateEdges) {
    const overrideStatus = stateStatusOverrides.get(edgeId)
    if (overrideStatus !== undefined) {
      if (overrideStatus !== providedStatus) return false
      continue
    }

    const [statusValues] = await dataMapper.query.readStateEdgeStatus({ edgeId })
    if (valueFor(statusValues, 'status') !== providedStatus) return false
  }

  return true
}

async function getCurrentState({ dataMapper, stateMachineId }) {
  const [stateValues] = await dataMapper.query.readStateMachineState({ vertexId: stateMachineId })
  return valueFor(stateValues, 'state')
}

async function findParentInstances({ dataMapper, instanceVertexId }) {
  const importParentIds = await dataMapper.query.listImportParentInstanceVertexIds({ vertexId: instanceVertexId })
  const gateParentIds = await dataMapper.query.listGateParentInstanceVertexIds({ vertexId: instanceVertexId })
  const parentInstanceVertexIds = new Set([...(importParentIds ?? []), ...(gateParentIds ?? [])])
  const parents = []

  for (const parentInstanceVertexId of parentInstanceVertexIds) {
    if (!parentInstanceVertexId) continue
    const [stateMachineId] = await dataMapper.query.readStateMachineId({ vertexId: parentInstanceVertexId })
    if (!stateMachineId) continue

    const [instanceIdValues] = await dataMapper.query.readInstanceIdValues({ vertexId: parentInstanceVertexId })
    parents.push({
      instanceVertexId: parentInstanceVertexId,
      stateMachineId,
      instanceId: valueFor(instanceIdValues, 'instanceId'),
    })
  }

  return parents
}

async function isGateFinished({
  dataMapper,
  gateStateEdgeId,
  cache,
  stateStatusOverrides,
  gateResultOverrides,
}) {
  let gateStatus = stateStatusOverrides.get(gateStateEdgeId)
  if (gateStatus === undefined) {
    const [statusValues] = await dataMapper.query.readStateEdgeStatus({ edgeId: gateStateEdgeId })
    gateStatus = valueFor(statusValues, 'status')
  }
  if (gateStatus !== GATE_PROVIDED_STATUS) return false

  let rawResult = gateResultOverrides.get(gateStateEdgeId)
  if (rawResult === undefined) {
    const [resultValues] = await dataMapper.query.readResultValues({ edgeId: gateStateEdgeId })
    rawResult = valueFor(resultValues, 'result')
  }
  if (rawResult === undefined || rawResult === null || rawResult === '') return false

  if (normalizeResult(rawResult) !== true) return true

  const [gateInstanceRefId] = await dataMapper.query.findEdgeTargetNodeId({ edgeId: gateStateEdgeId })
  if (!gateInstanceRefId) return false

  const [gateInstanceVertexId] = await dataMapper.query.findGateInstanceVertexIdForRef({ vertexId: gateInstanceRefId })
  if (!gateInstanceVertexId) return false

  const [gateStateMachineId] = await dataMapper.query.readGateStateMachineId({ vertexId: gateInstanceVertexId })
  if (!gateStateMachineId) return false

  return isInstanceFinished({
    dataMapper,
    instanceVertexId: gateInstanceVertexId,
    stateMachineId: gateStateMachineId,
    cache,
    stateStatusOverrides,
    gateResultOverrides,
  })
}

async function areAllGatesFinished({
  dataMapper,
  stateMachineId,
  cache,
  stateStatusOverrides,
  gateResultOverrides,
}) {
  const gateStateEdgeIds = await dataMapper.query.listGateStateEdgeIds({ vertexId: stateMachineId })

  for (const gateStateEdgeId of gateStateEdgeIds ?? []) {
    if (!gateStateEdgeId) continue
    const finished = await isGateFinished({
      dataMapper,
      gateStateEdgeId,
      cache,
      stateStatusOverrides,
      gateResultOverrides,
    })
    if (!finished) return false
  }

  return true
}

async function isInstanceFinished({
  dataMapper,
  instanceVertexId,
  stateMachineId,
  cache,
  stateStatusOverrides,
  gateResultOverrides,
}) {
  const cacheKey = `${instanceVertexId}:${stateMachineId}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  if (!await areAllStatesProvided({ dataMapper, stateMachineId, stateStatusOverrides })) {
    cache.set(cacheKey, false)
    return false
  }

  const importInstanceVertexIds = await dataMapper.query.listImportInstanceVertexIds({ vertexId: instanceVertexId })
  for (const importInstanceVertexId of importInstanceVertexIds ?? []) {
    if (!importInstanceVertexId) continue
    const [importStateMachineId] = await dataMapper.query.readImportStateMachineId({ vertexId: importInstanceVertexId })
    if (!importStateMachineId) {
      cache.set(cacheKey, false)
      return false
    }

    const finished = await isInstanceFinished({
      dataMapper,
      instanceVertexId: importInstanceVertexId,
      stateMachineId: importStateMachineId,
      cache,
      stateStatusOverrides,
      gateResultOverrides,
    })
    if (!finished) {
      cache.set(cacheKey, false)
      return false
    }
  }

  const gatesFinished = await areAllGatesFinished({
    dataMapper,
    stateMachineId,
    cache,
    stateStatusOverrides,
    gateResultOverrides,
  })
  cache.set(cacheKey, gatesFinished)
  return gatesFinished
}

async function collectCompletedStateMachines({
  dataMapper,
  instanceVertexId,
  stateMachineId,
  instanceId,
  visited,
  finishedCache,
  stateStatusOverrides,
  gateResultOverrides,
  completedStateMachines,
}) {
  if (!instanceVertexId || !stateMachineId) return
  const visitKey = `${instanceVertexId}:${stateMachineId}`
  if (visited.has(visitKey)) return
  visited.add(visitKey)

  const finished = await isInstanceFinished({
    dataMapper,
    instanceVertexId,
    stateMachineId,
    cache: finishedCache,
    stateStatusOverrides,
    gateResultOverrides,
  })
  const currentState = await getCurrentState({ dataMapper, stateMachineId })

  if (finished && currentState !== domain.vertex.stateMachine.constants.STATES.COMPLETE) {
    completedStateMachines.push({ instanceId, stateMachineId })
  }

  const parents = await findParentInstances({ dataMapper, instanceVertexId })
  for (const parent of parents) {
    await collectCompletedStateMachines({
      dataMapper,
      ...parent,
      visited,
      finishedCache,
      stateStatusOverrides,
      gateResultOverrides,
      completedStateMachines,
    })
  }
}

export async function handler({
  scope: {
    instanceId,
    instanceVertexId,
    stateMachineId,
    stateEdgeId,
    stateEdgeStatus,
    status,
    gateInstanceRefId,
    result,
    resultValue,
  },
  rootCtx: { dataMapper },
}) {
  const stateStatusOverrides = new Map()
  const providedStatus = stateEdgeStatus ?? status
  if (stateEdgeId && providedStatus !== undefined) {
    stateStatusOverrides.set(stateEdgeId, providedStatus)
  }

  const gateResultOverrides = new Map()
  if (gateInstanceRefId && stateEdgeId) {
    const serializedResult = typeof resultValue === 'string'
      ? resultValue
      : (result !== undefined ? JSON.stringify(result) : '')
    gateResultOverrides.set(stateEdgeId, serializedResult)
  }

  const completedStateMachines = []
  await collectCompletedStateMachines({
    dataMapper,
    instanceVertexId,
    stateMachineId,
    instanceId,
    visited: new Set(),
    finishedCache: new Map(),
    stateStatusOverrides,
    gateResultOverrides,
    completedStateMachines,
  })

  return { completedStateMachines }
}
