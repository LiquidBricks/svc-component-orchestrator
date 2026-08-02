export async function registerComponentAgent({ scope: { agentID }, rootCtx: { g, dataMapper } }) {
  const [existingComponentAgentVID] = await dataMapper.query.findComponentAgentVertexId({ agentID })

  if (existingComponentAgentVID) {
    return { componentAgentVID: existingComponentAgentVID, componentAgentAlreadyRegistered: true }
  }

  const { id: componentAgentVID } = await dataMapper.vertex.componentAgent.create({ agentID })
  return { componentAgentVID, componentAgentAlreadyRegistered: false }
}
