import { domain } from '@liquid-bricks/spec-domain/domain'
import { Errors } from '../../../../errors.js'
import { parseDependencyPath, resolveDependencyTargetId } from './dependencyPath.js'

function ensureArray(value) {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

export async function attachComponentGates({
  rootCtx: { g, dataMapper },
  scope: { handlerDiagnostics, component, dependencyList, componentVID },
}) {
  const { name: compName, hash, gates = [] } = component ?? {}
  if (!gates?.length) return

  handlerDiagnostics.require(
    Array.isArray(gates),
    Errors.PRECONDITION_INVALID,
    'gates must be an array',
    { field: 'gates', component: compName, hash },
  )

  for (const gateItem of gates ?? []) {
    const { name: gateName, hash: gateHash, fnc, inject, waitFor = [], deps = [], codeRef } = gateItem ?? {}

    handlerDiagnostics.require(
      typeof gateName === 'string' && gateName.length,
      Errors.PRECONDITION_REQUIRED,
      'gate name required',
      { field: 'gate.name', component: compName, hash },
    )
    handlerDiagnostics.require(
      typeof gateHash === 'string' && gateHash.length,
      Errors.PRECONDITION_REQUIRED,
      'gate hash required',
      { field: 'gate.hash', component: compName, hash, gate: gateName },
    )
    handlerDiagnostics.require(
      typeof fnc === 'string' && fnc.length,
      Errors.PRECONDITION_REQUIRED,
      'gate fnc required',
      { field: 'gate.fnc', component: compName, hash, gate: gateName },
    )
    handlerDiagnostics.require(
      waitFor === undefined || Array.isArray(waitFor),
      Errors.PRECONDITION_INVALID,
      'gate waitFor must be an array',
      { field: 'gate.waitFor', component: compName, hash, gate: gateName },
    )
    handlerDiagnostics.require(
      deps === undefined || Array.isArray(deps),
      Errors.PRECONDITION_INVALID,
      'gate deps must be an array',
      { field: 'gate.deps', component: compName, hash, gate: gateName },
    )
    handlerDiagnostics.require(
      inject === undefined || (inject && typeof inject === 'object' && !Array.isArray(inject)),
      Errors.PRECONDITION_INVALID,
      'gate inject must be an object',
      { field: 'gate.inject', component: compName, hash, gate: gateName },
    )

    const [gatedComponentId] = await g
      .V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', gateHash)
      .id()

    handlerDiagnostics.require(
      gatedComponentId,
      Errors.PRECONDITION_INVALID,
      `Gated component not found: ${gateName}#${gateHash}`,
      { component: compName, hash, gate: gateName, gateHash },
    )

    const { id: gateRefId } = await dataMapper.vertex.gateRef.create({ alias: gateName, fnc, codeRef })
    await dataMapper.edge.has_gate.component_gateRef.create({ fromId: componentVID, toId: gateRefId })
    await dataMapper.edge.gate_of.gateRef_component.create({ fromId: gateRefId, toId: gatedComponentId })

    for (const dep of ensureArray(waitFor)) {
      const { trimmedDep, importPath, targetType, targetName } = parseDependencyPath({
        handlerDiagnostics,
        dep,
        compName,
        hash,
        dependencyType: 'gate',
        dependencyName: gateName,
      })

      handlerDiagnostics.require(
        targetType === 'task' || targetType === 'data',
        Errors.PRECONDITION_INVALID,
        `gate waitFor only supports data/task for component(${compName})#${hash} gate:${gateName} dep[${trimmedDep}]`,
        { component: compName, hash, gate: gateName, dep: trimmedDep, type: targetType },
      )

      const targetId = await resolveDependencyTargetId({
        handlerDiagnostics,
        dependencyList,
        g,
        componentVID,
        importPath,
        targetType,
        targetName,
        compName,
        hash,
        dependencyType: 'gate',
        dependencyName: gateName,
        dep: trimmedDep,
      })

      const createEdge = targetType === 'task'
        ? dataMapper.edge.wait_for.gateRef_task.create
        : dataMapper.edge.wait_for.gateRef_data.create
      await createEdge({ fromId: gateRefId, toId: targetId })
    }

    for (const dep of ensureArray(deps)) {
      const { trimmedDep, importPath, targetType, targetName } = parseDependencyPath({
        handlerDiagnostics,
        dep,
        compName,
        hash,
        dependencyType: 'gate',
        dependencyName: gateName,
      })

      handlerDiagnostics.require(
        targetType === 'task' || targetType === 'data',
        Errors.PRECONDITION_INVALID,
        `gate deps only supports data/task for component(${compName})#${hash} gate:${gateName} dep[${trimmedDep}]`,
        { component: compName, hash, gate: gateName, dep: trimmedDep, type: targetType },
      )

      const targetId = await resolveDependencyTargetId({
        handlerDiagnostics,
        dependencyList,
        g,
        componentVID,
        importPath,
        targetType,
        targetName,
        compName,
        hash,
        dependencyType: 'gate',
        dependencyName: gateName,
        dep: trimmedDep,
      })

      const createEdge = targetType === 'task'
        ? dataMapper.edge.has_dependency.gateRef_task.create
        : dataMapper.edge.has_dependency.gateRef_data.create
      await createEdge({ fromId: gateRefId, toId: targetId })
    }
  }
}
