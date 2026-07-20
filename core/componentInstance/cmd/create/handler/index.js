import { ulid } from 'ulid'
import { createComponentInstance } from './createComponentInstance.js'
import { componentImports } from '../loadData/componentImports.js'
import { componentGates } from '../loadData/componentGates.js'

export async function handler({
  rootCtx: { g, dataMapper },
  scope: { instanceId, componentId, imports, gates },
}) {
  const { instanceVertexId, stateMachineId: rootStateMachineId } = await createComponentInstance({ g, dataMapper, componentId, instanceId })

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
      const { instanceVertexId: importedInstanceVertexId, stateMachineId: importedStateMachineId } = await createComponentInstance({
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
        const [importRefLookupId] = await dataMapper.query.findImportRefLookupId({ alias, vertexId: parentComponentId, id: importedComponentId })
        resolvedImportRefId = importRefLookupId
      }

      if (resolvedImportRefId) {
        await dataMapper.edge.uses_import.importInstanceRef_importRef.create({
          fromId: importInstanceRefId,
          toId: resolvedImportRefId,
        })
      }

      const nestedImports = await componentImports({
        rootCtx: { g, dataMapper },
        scope: { componentId: importedComponentId },
      })

      const nestedGates = await componentGates({
        rootCtx: { g, dataMapper },
        scope: { componentId: importedComponentId },
      })

      await createGateInstances({
        gates: nestedGates?.gates ?? [],
        parentComponentId: importedComponentId,
        parentInstanceVertexId: importedInstanceVertexId,
        parentStateMachineId: importedStateMachineId,
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

  async function createGateInstances({ gates: gatesToCreate, parentComponentId, parentInstanceVertexId, parentStateMachineId }) {
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
      const { instanceVertexId: gatedInstanceVertexId, stateMachineId: gatedStateMachineId } = await createComponentInstance({
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
      await dataMapper.edge.has_gate_state.stateMachine_gateInstanceRef.create({
        fromId: parentStateMachineId,
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
        rootCtx: { g, dataMapper },
        scope: { componentId: gatedComponentId },
      })

      const nestedGates = await componentGates({
        rootCtx: { g, dataMapper },
        scope: { componentId: gatedComponentId },
      })

      await createGateInstances({
        gates: nestedGates?.gates ?? [],
        parentComponentId: gatedComponentId,
        parentInstanceVertexId: gatedInstanceVertexId,
        parentStateMachineId: gatedStateMachineId,
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
    parentStateMachineId: rootStateMachineId,
  })

  await dataMapper.vertex.componentInstance.index.injectionRouting.bind({
    rootInstanceVertexId: instanceVertexId,
  })

  return { importedInstances }
}
