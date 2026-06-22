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


  const [existingComponentAgentVID] = await dataMapper.query.findComponentAgentVertexId({ agentID })

  if (existingComponentAgentVID) {
    return { componentAgentVID: existingComponentAgentVID }
  }

  const { id: componentAgentVID } = await dataMapper.vertex.componentAgent.create({ agentID })
  return { componentAgentVID }
}
