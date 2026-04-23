import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

import { domain } from '@liquid-bricks/spec-domain/domain'

const PROVIDED_STATUS = domain.edge.has_data_state.stateMachine_data.constants.Status.PROVIDED
const STATE_EDGE_LABELS = [
  domain.edge.has_data_state.stateMachine_data.constants.LABEL,
  domain.edge.has_task_state.stateMachine_task.constants.LABEL,
]

async function areAllStatesProvided({ g, stateMachineId }) {
  const statusMaps = await g
    .V(stateMachineId)
    .outE(...STATE_EDGE_LABELS)
    .valueMap('status')
  if (!statusMaps?.length) return true

  return statusMaps.every(map => {
    const statusMap = Array.isArray(map) ? map[0] : map
    const statusValues = statusMap?.status ?? statusMap
    const status = Array.isArray(statusValues) ? statusValues[0] : statusValues
    return status === PROVIDED_STATUS
  })
}

async function publishCompletion({ natsContext, instanceId, stateMachineId }) {
  const subject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('componentInstance')
    .channel('evt')
    .action('state_machine_completed')
    .version('v1')
    .build()

  await natsContext.publish(
    subject,
    JSON.stringify({ data: { instanceId, stateMachineId } })
  )
}

async function getCurrentState({ g, stateMachineId }) {
  const [stateValues] = await g.V(stateMachineId).valueMap('state')
  const stateMap = stateValues?.state ?? stateValues
  return Array.isArray(stateMap) ? stateMap[0] : stateMap
}

async function findParentInstances({ g, instanceVertexId }) {
  const parentInstanceVertexIds = await g
    .V(instanceVertexId)
    .in(domain.edge.uses_import.importInstanceRef_componentInstance.constants.LABEL)
    .in(domain.edge.uses_import.componentInstance_importInstanceRef.constants.LABEL)
    .id()

  const parents = []
  for (const parentInstanceVertexId of parentInstanceVertexIds ?? []) {
    if (!parentInstanceVertexId) continue
    const [stateMachineId] = await g
      .V(parentInstanceVertexId)
      .out(domain.edge.has_stateMachine.componentInstance_stateMachine.constants.LABEL)
      .id()
    if (!stateMachineId) continue

    const [instanceIdValues] = await g.V(parentInstanceVertexId).valueMap('instanceId')
    const instanceIdValue = instanceIdValues?.instanceId ?? instanceIdValues
    const instanceId = Array.isArray(instanceIdValue) ? instanceIdValue[0] : instanceIdValue
    parents.push({ instanceVertexId: parentInstanceVertexId, stateMachineId, instanceId })
  }
  return parents
}

async function isInstanceFinished({ g, instanceVertexId, stateMachineId, cache }) {
  const cacheKey = `${instanceVertexId}:${stateMachineId}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const statesProvided = await areAllStatesProvided({ g, stateMachineId })
  if (!statesProvided) {
    cache.set(cacheKey, false)
    return false
  }

  const importInstanceVertexIds = await g
    .V(instanceVertexId)
    .out(domain.edge.uses_import.componentInstance_importInstanceRef.constants.LABEL)
    .out(domain.edge.uses_import.importInstanceRef_componentInstance.constants.LABEL)
    .id()

  for (const importInstanceVertexId of importInstanceVertexIds ?? []) {
    if (!importInstanceVertexId) continue
    const [importStateMachineId] = await g
      .V(importInstanceVertexId)
      .out(domain.edge.has_stateMachine.componentInstance_stateMachine.constants.LABEL)
      .id()
    if (!importStateMachineId) {
      cache.set(cacheKey, false)
      return false
    }
    const finishedImport = await isInstanceFinished({
      g,
      instanceVertexId: importInstanceVertexId,
      stateMachineId: importStateMachineId,
      cache,
    })
    if (!finishedImport) {
      cache.set(cacheKey, false)
      return false
    }
  }

  cache.set(cacheKey, true)
  return true
}

async function completeInstanceChain({ g, natsContext, instanceVertexId, stateMachineId, instanceId, visited, finishedCache }) {
  if (!instanceVertexId || !stateMachineId) return
  const visitKey = `${instanceVertexId}:${stateMachineId}`
  if (visited.has(visitKey)) return
  visited.add(visitKey)

  const finished = await isInstanceFinished({ g, instanceVertexId, stateMachineId, cache: finishedCache })
  const currentState = await getCurrentState({ g, stateMachineId })

  if (finished && currentState !== domain.vertex.stateMachine.constants.STATES.COMPLETE) {
    await publishCompletion({ natsContext, instanceId, stateMachineId })
  }

  const parents = await findParentInstances({ g, instanceVertexId })
  for (const parent of parents) {
    await completeInstanceChain({ g, natsContext, ...parent, visited, finishedCache })
  }
}

export async function completeStateMachineIfFinished({
  scope: { handlerDiagnostics, stateMachineId, instanceId, instanceVertexId },
  rootCtx: { g, natsContext },
}) {
  const visited = new Set()
  const finishedCache = new Map()
  await completeInstanceChain({ g, natsContext, instanceVertexId, stateMachineId, instanceId, visited, finishedCache })
}
