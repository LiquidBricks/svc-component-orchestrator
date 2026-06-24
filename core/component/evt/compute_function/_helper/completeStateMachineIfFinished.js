import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { domain } from '@liquid-bricks/spec-domain/domain'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


const PROVIDED_STATUS = domain.edge.has_data_state.stateMachine_data.constants.Status.PROVIDED

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

async function areAllStatesProvided({ g, dataMapper, stateMachineId }) {
  const statusMaps = await dataMapper.query.readStateMachineStatusMaps({ vertexId: stateMachineId })
  if (!statusMaps?.length) return true

  return statusMaps.every(map => {
    const statusMap = Array.isArray(map) ? map[0] : map
    const status = valueFor(statusMap, 'status')
    return status === PROVIDED_STATUS
  })
}

async function publishCompletion({ natsContext, instanceId, stateMachineId }) {
  const subject = createBasicSubject(natsEvents['*'].component_service['*']['*'].evt.componentInstance.state_machine_completed.v1['*']).forPublish()
    .env('prod')
    .build()

  await natsContext.publish(
    subject,
    JSON.stringify({ data: { instanceId, stateMachineId } })
  )
}

async function getCurrentState({ g, dataMapper, stateMachineId }) {
  const [stateValues] = await dataMapper.query.readStateMachineState({ vertexId: stateMachineId })
  return valueFor(stateValues, 'state')
}

async function findParentInstances({ g, dataMapper, instanceVertexId }) {
  const importParentInstanceVertexIds = await dataMapper.query.listImportParentInstanceVertexIds({ vertexId: instanceVertexId })

  const gateParentInstanceVertexIds = await dataMapper.query.listGateParentInstanceVertexIds({ vertexId: instanceVertexId })

  const parents = []
  const parentInstanceVertexIds = new Set([
    ...(importParentInstanceVertexIds ?? []),
    ...(gateParentInstanceVertexIds ?? []),
  ])

  for (const parentInstanceVertexId of parentInstanceVertexIds) {
    if (!parentInstanceVertexId) continue
    const [stateMachineId] = await dataMapper.query.readStateMachineId({ vertexId: parentInstanceVertexId })
    if (!stateMachineId) continue

    const [instanceIdValues] = await dataMapper.query.readInstanceIdValues({ vertexId: parentInstanceVertexId })
    const instanceId = valueFor(instanceIdValues, 'instanceId')
    parents.push({ instanceVertexId: parentInstanceVertexId, stateMachineId, instanceId })
  }
  return parents
}

async function isGateFinished({ g, dataMapper, gateInstanceRefId, cache }) {
  const [resultValues] = await dataMapper.query.readResultValues({ vertexId: gateInstanceRefId })
  const rawResult = valueFor(resultValues, 'result')
  if (rawResult === undefined || rawResult === null || rawResult === '') return false

  const result = normalizeResult(rawResult)
  if (result !== true) return true

  const [gateInstanceVertexId] = await dataMapper.query.findGateInstanceVertexIdForRef({ vertexId: gateInstanceRefId })
  if (!gateInstanceVertexId) return false

  const [gateStateMachineId] = await dataMapper.query.readGateStateMachineId({ vertexId: gateInstanceVertexId })
  if (!gateStateMachineId) return false

  return isInstanceFinished({
    g, dataMapper,
    instanceVertexId: gateInstanceVertexId,
    stateMachineId: gateStateMachineId,
    cache,
  })
}

async function areAllGatesFinished({ g, dataMapper, instanceVertexId, cache }) {
  const gateInstanceRefIds = await dataMapper.query.listGateInstanceRefIds({ vertexId: instanceVertexId })

  for (const gateInstanceRefId of gateInstanceRefIds ?? []) {
    if (!gateInstanceRefId) continue
    const finishedGate = await isGateFinished({ g, dataMapper, gateInstanceRefId, cache })
    if (!finishedGate) return false
  }

  return true
}

async function isInstanceFinished({ g, dataMapper, instanceVertexId, stateMachineId, cache }) {
  const cacheKey = `${instanceVertexId}:${stateMachineId}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const statesProvided = await areAllStatesProvided({ g, dataMapper, stateMachineId })
  if (!statesProvided) {
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
    const finishedImport = await isInstanceFinished({
      g, dataMapper,
      instanceVertexId: importInstanceVertexId,
      stateMachineId: importStateMachineId,
      cache,
    })
    if (!finishedImport) {
      cache.set(cacheKey, false)
      return false
    }
  }

  const gatesFinished = await areAllGatesFinished({ g, dataMapper, instanceVertexId, cache })
  if (!gatesFinished) {
    cache.set(cacheKey, false)
    return false
  }

  cache.set(cacheKey, true)
  return true
}

async function completeInstanceChain({ g, dataMapper, natsContext, instanceVertexId, stateMachineId, instanceId, visited, finishedCache }) {
  if (!instanceVertexId || !stateMachineId) return
  const visitKey = `${instanceVertexId}:${stateMachineId}`
  if (visited.has(visitKey)) return
  visited.add(visitKey)

  const finished = await isInstanceFinished({ g, dataMapper, instanceVertexId, stateMachineId, cache: finishedCache })
  const currentState = await getCurrentState({ g, dataMapper, stateMachineId })

  if (finished && currentState !== domain.vertex.stateMachine.constants.STATES.COMPLETE) {
    await publishCompletion({ natsContext, instanceId, stateMachineId })
  }

  const parents = await findParentInstances({ g, dataMapper, instanceVertexId })
  for (const parent of parents) {
    await completeInstanceChain({ g, dataMapper, natsContext, ...parent, visited, finishedCache })
  }
}

export async function completeStateMachineIfFinished({
  scope: { handlerDiagnostics, stateMachineId, instanceId, instanceVertexId },
  rootCtx: { g, dataMapper, natsContext },
}) {
  const visited = new Set()
  const finishedCache = new Map()
  await completeInstanceChain({ g, dataMapper, natsContext, instanceVertexId, stateMachineId, instanceId, visited, finishedCache })
}
