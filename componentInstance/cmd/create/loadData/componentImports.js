import { domain } from '@liquid-bricks/spec-domain/domain'

export async function componentImports({ rootCtx: { g }, scope: { componentId } }) {
  const imports = []
  const importEdgeIds = await g.V(componentId)
    .outE(domain.edge.has_import.component_component.constants.LABEL)
    .id()

  for (const importEdgeId of importEdgeIds ?? []) {
    const [edgeValues] = await g.E(importEdgeId).valueMap('alias')
    const [importedComponentId] = await g.E(importEdgeId).inV().id()

    const [importedComponentValues] = await g.V(importedComponentId).valueMap('hash')

    imports.push({
      alias: edgeValues.alias,
      componentId: importedComponentId,
      componentHash: importedComponentValues.hash,
    })
  }

  return { imports }
}
