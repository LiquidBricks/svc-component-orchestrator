export async function compileInjectionRoutingIndex({
  rootCtx: { dataMapper },
  scope: { componentVID },
}) {
  await dataMapper.vertex.component.index.injectionRouting.compile({
    componentId: componentVID,
  })
}
