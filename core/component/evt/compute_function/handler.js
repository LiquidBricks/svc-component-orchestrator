import { domain } from '@liquid-bricks/spec-domain/domain'

async function recordGateResult({ g, instanceVertexId, name, resultValue, now }) {
  if (!instanceVertexId || !name) return

  const [gateInstanceRefId] = await g
    .V(instanceVertexId)
    .out(domain.edge.uses_gate.componentInstance_gateInstanceRef.constants.LABEL)
    .filter(_ => _.out(domain.edge.uses_gate.gateInstanceRef_gateRef.constants.LABEL).has('alias', name))
    .id()
  if (!gateInstanceRefId) return

  await g
    .V(gateInstanceRefId)
    .property('result', resultValue)
    .property('updatedAt', now)
}

export async function handler({ rootCtx: { g }, scope: { instanceId, instanceVertexId, type, name, result, stateEdgeId, stateEdgeStatus } }) {
  const now = new Date().toISOString()
  const resultValue = result != null ? JSON.stringify(result) : ''

  if (type === 'gate') {
    await recordGateResult({ g, instanceVertexId, name, resultValue, now })
    return { instanceId }
  }

  await g
    .E(stateEdgeId)
    .property('result', resultValue)
    .property('status', stateEdgeStatus)
    .property('updatedAt', now)

  return { instanceId }
}
