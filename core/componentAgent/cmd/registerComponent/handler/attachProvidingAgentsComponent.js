
export async function attachProvidingAgentsComponent({
  rootCtx: { g, dataMapper },
  scope: { componentAgentVID, componentVID, component },
}) {
  const providesComponentLabel = 'domain.edge.provides_component.componentAgent__component'

  const [existingComponentId] = await g
    .V(componentAgentVID)
    .out(providesComponentLabel)
    .has('hash', component.hash)
    .id()

  if (existingComponentId) return
  const createProvidesComponent = dataMapper.edge.provides_component && dataMapper.edge.provides_component.componentAgent_component && dataMapper.edge.provides_component.componentAgent_component.create
  if (typeof createProvidesComponent === 'function') {
    await createProvidesComponent({ fromId: componentAgentVID, toId: componentVID })
    return
  }

  const now = new Date().toISOString()
  await g
    .addE(providesComponentLabel, componentAgentVID, componentVID)
    .property('createdAt', now)
    .property('updatedAt', now)
}
