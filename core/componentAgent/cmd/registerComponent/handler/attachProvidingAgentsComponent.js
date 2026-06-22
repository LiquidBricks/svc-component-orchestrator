
export async function attachProvidingAgentsComponent({
  rootCtx: { g, dataMapper },
  scope: { componentAgentVID, componentVID, component },
}) {

  const [existingComponentId] = await dataMapper.query.findProvidedComponentId({ componentAgentId: componentAgentVID, componentHash: component.hash })

  if (existingComponentId) return
  await dataMapper.edge.provides_component.componentAgent_component.create({
    fromId: componentAgentVID,
    toId: componentVID,
  })
}
