import { domain } from '@liquid-bricks/spec-domain/domain'

function getStatus(value) {
  const statusMap = Array.isArray(value) ? value[0] : value
  const statusValue = statusMap?.status ?? statusMap
  return Array.isArray(statusValue) ? statusValue[0] : statusValue
}

export async function handler({ rootCtx: { g, dataMapper }, scope: { handlerDiagnostics, stateId } }) {
  let currentStatus = null
  try {
    const statusValues = await dataMapper.query.readStateEdgeStatus({ edgeId: stateId })
    currentStatus = getStatus(statusValues)
  } catch {
    // best-effort read; fall through to set running
  }

  if (currentStatus === domain.edge.has_data_state.stateMachine_data.constants.Status.PROVIDED) {
    return
  }

  const now = new Date().toISOString()

  await dataMapper.edge.has_data_state.stateMachine_data.setRunning({ updatedAt: now, edgeId: stateId })
}
