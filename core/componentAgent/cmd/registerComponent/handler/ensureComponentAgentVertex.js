import { Errors } from '../../../../../errors.js'

export async function ensureComponentAgentVertex({
  rootCtx: { g, dataMapper },
  scope: { handlerDiagnostics, agentID },
}) {
  handlerDiagnostics.require(
    typeof agentID === 'string' && agentID.length,
    Errors.PRECONDITION_REQUIRED,
    'agentID is required',
    { field: 'agentID' },
  )
  const componentAgentLabel = 'domain.vertex.componentAgent'


  const [existingComponentAgentVID] = await g
    .V()
    .has('label', componentAgentLabel)
    .has('agentID', agentID)
    .id()

  if (existingComponentAgentVID) {
    return { componentAgentVID: existingComponentAgentVID }
  }

  const createComponentAgent = dataMapper.vertex.componentAgent && dataMapper.vertex.componentAgent.create
  if (typeof createComponentAgent === 'function') {
    const { id: componentAgentVID } = await createComponentAgent({ agentID })
    return { componentAgentVID }
  }

  const now = new Date().toISOString()
  const [componentAgentVID] = await g
    .addV(componentAgentLabel)
    .property('agentID', agentID)
    .property('createdAt', now)
    .property('updatedAt', now)
    .id()
  return { componentAgentVID }
}
