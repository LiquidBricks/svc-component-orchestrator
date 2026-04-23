export async function createComponentVertex({ rootCtx: { dataMapper }, scope: { component } }) {
  const { hash, name: compName } = component
  const { id: componentVID } = await dataMapper.vertex.component.create({ hash, name: compName })
  return { componentVID }
}
