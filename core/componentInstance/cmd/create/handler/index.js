import { ulid } from 'ulid'
import { createComponentInstance } from './createComponentInstance.js'
import { componentImports } from '../loadData/componentImports.js'
import { componentGates } from '../loadData/componentGates.js'
import { domain } from '@liquid-bricks/spec-domain/domain'

export async function handler({ rootCtx: { g, dataMapper }, scope: { instanceId, componentId, imports, gates } }) {
  const { instanceVertexId } = await createComponentInstance({ g, dataMapper, componentId, instanceId })

  async function createImportInstances({ imports: importsToCreate, parentComponentId, parentInstanceVertexId }) {
    const created = []

    for (const {
      alias,
      waitFor = [],
      componentId: importedComponentId,
      componentHash: importedComponentHash,
      importRefId,
    } of importsToCreate ?? []) {
      const importedInstanceId = ulid()
      const { instanceVertexId: importedInstanceVertexId } = await createComponentInstance({
        g,
        dataMapper,
        componentId: importedComponentId,
        instanceId: importedInstanceId,
      })

      const { id: importInstanceRefId } = await dataMapper.vertex.importInstanceRef.create()
      await dataMapper.edge.uses_import.componentInstance_importInstanceRef.create({
        fromId: parentInstanceVertexId,
        toId: importInstanceRefId,
      })
      await dataMapper.edge.uses_import.importInstanceRef_componentInstance.create({
        fromId: importInstanceRefId,
        toId: importedInstanceVertexId,
      })

      let resolvedImportRefId = importRefId
      if (!resolvedImportRefId && alias && parentComponentId && importedComponentId) {
        const [importRefLookupId] = await g
          .V(parentComponentId)
          .out(domain.edge.has_import.component_importRef.constants.LABEL)
          .has('alias', alias)
          .filter(_ => _.out(domain.edge.import_of.importRef_component.constants.LABEL).has('id', importedComponentId))
          .id()
        resolvedImportRefId = importRefLookupId
      }

      if (resolvedImportRefId) {
        await dataMapper.edge.uses_import.importInstanceRef_importRef.create({
          fromId: importInstanceRefId,
          toId: resolvedImportRefId,
        })
      }

      const nestedImports = await componentImports({
        rootCtx: { g },
        scope: { componentId: importedComponentId },
      })

      const nestedGates = await componentGates({
        rootCtx: { g },
        scope: { componentId: importedComponentId },
      })

      await createGateInstances({
        gates: nestedGates?.gates ?? [],
        parentComponentId: importedComponentId,
        parentInstanceVertexId: importedInstanceVertexId,
      })

      await createImportInstances({
        imports: nestedImports?.imports ?? [],
        parentComponentId: importedComponentId,
        parentInstanceVertexId: importedInstanceVertexId,
      })

      created.push({
        instanceId: importedInstanceId,
        componentHash: importedComponentHash,
        alias,
        waitFor,
      })
    }

    return created
  }

  async function createGateInstances({ gates: gatesToCreate, parentComponentId, parentInstanceVertexId }) {
    const created = []

    for (const {
      alias,
      waitFor = [],
      deps = [],
      componentId: gatedComponentId,
      componentHash: gatedComponentHash,
      gateRefId,
    } of gatesToCreate ?? []) {
      const gatedInstanceId = ulid()
      const { instanceVertexId: gatedInstanceVertexId } = await createComponentInstance({
        g,
        dataMapper,
        componentId: gatedComponentId,
        instanceId: gatedInstanceId,
      })

      const { id: gateInstanceRefId } = await dataMapper.vertex.gateInstanceRef.create()
      await dataMapper.edge.uses_gate.componentInstance_gateInstanceRef.create({
        fromId: parentInstanceVertexId,
        toId: gateInstanceRefId,
      })
      await dataMapper.edge.uses_gate.gateInstanceRef_componentInstance.create({
        fromId: gateInstanceRefId,
        toId: gatedInstanceVertexId,
      })
      if (gateRefId) {
        await dataMapper.edge.uses_gate.gateInstanceRef_gateRef.create({
          fromId: gateInstanceRefId,
          toId: gateRefId,
        })
      }

      const nestedImports = await componentImports({
        rootCtx: { g },
        scope: { componentId: gatedComponentId },
      })

      const nestedGates = await componentGates({
        rootCtx: { g },
        scope: { componentId: gatedComponentId },
      })

      await createGateInstances({
        gates: nestedGates?.gates ?? [],
        parentComponentId: gatedComponentId,
        parentInstanceVertexId: gatedInstanceVertexId,
      })

      await createImportInstances({
        imports: nestedImports?.imports ?? [],
        parentComponentId: gatedComponentId,
        parentInstanceVertexId: gatedInstanceVertexId,
      })

      created.push({
        instanceId: gatedInstanceId,
        componentHash: gatedComponentHash,
        alias,
        waitFor,
        deps,
      })
    }

    return created
  }

  const importedInstances = await createImportInstances({
    imports,
    parentComponentId: componentId,
    parentInstanceVertexId: instanceVertexId,
  })

  await createGateInstances({
    gates,
    parentComponentId: componentId,
    parentInstanceVertexId: instanceVertexId,
  })

  return { importedInstances }
}
