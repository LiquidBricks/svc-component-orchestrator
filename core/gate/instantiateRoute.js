import { ulid } from 'ulid'
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { handler as createTree } from '../componentInstance/cmd/create/handler/index.js'
import { componentImports } from '../componentInstance/cmd/create/loadData/componentImports.js'
import { componentGates } from '../componentInstance/cmd/create/loadData/componentGates.js'
import { publishCreatedFacts } from '../componentInstance/cmd/create/publishCreatedFacts.js'

const first = value => Array.isArray(value) ? value[0] : value

export async function instantiateRoute({ rootCtx, routeCtx, scope, gateInstanceRefId, gateRefId }) {
  const { g, dataMapper, natsContext } = rootCtx
  const [componentId] = await dataMapper.query.findGatedComponentIdForGateRef({ vertexId: gateRefId })
  const [values] = await dataMapper.query.readGatedComponentValues({ vertexId: componentId })
  const componentHash = first(values.hash)
  const instanceId = ulid()
  const { imports } = await componentImports({ rootCtx, scope: { componentId } })
  const { gates } = await componentGates({ rootCtx, scope: { componentId } })
  const { createdInstances } = await createTree({ rootCtx,
    scope: { instanceId, componentId, componentHash, imports, gates } })
  const child = createdInstances[0]
  await dataMapper.edge.uses_gate.gateInstanceRef_componentInstance.create({
    fromId: gateInstanceRefId, toId: child.instanceVertexId,
  })

  let rootId = scope.instanceVertexId
  const seen = new Set()
  while (!seen.has(rootId)) {
    seen.add(rootId)
    const parents = [...await dataMapper.query.listImportParentInstanceVertexIds({ vertexId: rootId }),
      ...await dataMapper.query.listGateParentInstanceVertexIds({ vertexId: rootId })]
    if (!parents.length) break
    rootId = parents[0]
  }
  const { providedInjections } = await dataMapper.vertex.componentInstance.index.injectionRouting.bind({
    rootInstanceVertexId: rootId,
    targetInstanceVertexIds: createdInstances.map(instance => instance.instanceVertexId),
    selection: { ownerInstanceVertexId: scope.instanceVertexId, alias: scope.name },
  })
  await publishCreatedFacts({ rootCtx, routeCtx, scope: { ...scope, createdInstances } })
  for (const { target, result } of providedInjections) {
    const key = `component_service.function_result.evt.component.compute_function.v1.${target.type}`
    await natsContext.publish(createSubject(routeCtx.emits[key]).forPublish().env('prod').build(),
      JSON.stringify({ data: { instanceId: target.instanceId, stateId: target.stateEdgeId,
        name: target.name, type: target.type, result, status: 'provided' } }))
  }
  return child.instanceVertexId
}
