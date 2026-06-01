export async function createComponentVertex({ rootCtx: { dataMapper }, scope: { component, componentVID } }) {
  if (componentVID) return { componentVID }
  const { hash, name: compName } = component
  const { id: createdComponentVID } = await dataMapper.vertex.component.create({ hash, name: compName })
  return { componentVID: createdComponentVID }
}
