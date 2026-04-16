import { domain } from '@liquid-bricks/spec-domain/domain'

function getStatus(value) {
  const statusMap = Array.isArray(value) ? value[0] : value
  const statusValue = statusMap?.status ?? statusMap
  return Array.isArray(statusValue) ? statusValue[0] : statusValue
}

export async function handler({ rootCtx: { g }, scope: { handlerDiagnostics, stateId } }) {
  let currentStatus = null
  try {
    const vertex = g?.V?.(stateId)
    if (vertex && typeof vertex.valueMap === 'function') {
      const [statusValues] = await vertex.valueMap('status')
      currentStatus = getStatus(statusValues)
    }
  } catch {
    // best-effort read; fall through to set running
  }

  if (currentStatus === domain.edge.has_data_state.stateMachine_data.constants.Status.PROVIDED) {
    return
  }

  const now = new Date().toISOString()

  await g
    .V(stateId)
    .property('status', domain.edge.has_data_state.stateMachine_data.constants.Status.RUNNING)
    .property('updatedAt', now)
}
