export async function handler({ rootCtx: { g }, scope: { handlerDiagnostics, stateId } }) {
  const now = new Date().toISOString()

  await g
    .V(stateId)
    .property('status', 'running')
    .property('updatedAt', now)
}
