export async function handleStateResult({ rootCtx: { g, dataMapper }, scope: { instanceId, result, stateEdgeId, stateEdgeStatus } }) {
  const now = new Date().toISOString()
  const resultValue = result != null ? JSON.stringify(result) : ''

  await dataMapper.mutation.updateStateEdgeResultAndStatusAndUpdatedAt({ updatedAt: now, status: stateEdgeStatus, result: resultValue, edgeId: stateEdgeId })

  return { instanceId }
}
