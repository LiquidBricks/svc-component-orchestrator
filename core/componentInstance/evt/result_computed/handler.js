export async function handler({ rootCtx: { g }, scope: { handlerDiagnostics, instanceId, type, name, result, stateEdgeId, stateEdgeStatus } }) {
  if (type === 'gate') return { instanceId }

  const now = new Date().toISOString()
  const resultValue = result != null ? JSON.stringify(result) : ''

  await g
    .E(stateEdgeId)
    .property('result', resultValue)
    .property('status', stateEdgeStatus)
    .property('updatedAt', now)

  return { instanceId }
}
