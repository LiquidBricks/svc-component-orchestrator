import { Errors } from '../../../../errors.js'
import { domain } from '@liquid-bricks/spec-domain/domain'

function parseDependencyPath({ handlerDiagnostics, dep, compName, hash, dependencyType, dependencyName }) {
  const trimmedDep = String(dep ?? '').trim()
  const parts = trimmedDep.split('.').filter(Boolean)

  handlerDiagnostics.require(
    parts.length >= 2,
    Errors.PRECONDITION_REQUIRED,
    `Dependency path is required for component(${compName})#${hash} ${dependencyType}:${dependencyName} dep[${trimmedDep}]`,
    { component: compName, hash, dependencyType, dependencyName, dep: trimmedDep },
  )

  const targetType = parts[parts.length - 2]
  const targetName = parts[parts.length - 1]
  const importPath = parts.slice(0, parts.length - 2)

  handlerDiagnostics.require(
    ['data', 'task', 'deferred', 'service'].includes(targetType),
    Errors.PRECONDITION_INVALID,
    `Unknown dependency type:${targetType} for component(${compName})#${hash} ${dependencyType}:${dependencyName} dep[${trimmedDep}]`,
    { type: targetType, dep: trimmedDep, component: compName, hash },
  )
  handlerDiagnostics.require(
    targetName,
    Errors.PRECONDITION_REQUIRED,
    `Dependency name is required for component(${compName})#${hash} ${dependencyType}:${dependencyName} dep[${trimmedDep}]`,
    { component: compName, hash, dependencyType, dependencyName },
  )
  handlerDiagnostics.require(
    targetType !== 'deferred' || importPath.length === 0,
    Errors.PRECONDITION_INVALID,
    `Deferred dependency cannot reference imports for component(${compName})#${hash} ${dependencyType}:${dependencyName} dep[${trimmedDep}]`,
    { component: compName, hash, dependencyType, dependencyName, dep: trimmedDep },
  )

  return {
    trimmedDep,
    importPath,
    targetType,
    targetName,
  }
}

async function resolveImportedComponent({ g, handlerDiagnostics, startComponentId, importPath, compName, hash, dependencyType, dependencyName, pathType, pathValue }) {
  let componentId = startComponentId
  for (const alias of importPath) {
    const [edgeId] = await g
      .V(componentId)
      .outE(domain.edge.has_import.component_component.constants.LABEL)
      .has('alias', alias)
      .id()

    handlerDiagnostics.require(
      edgeId,
      Errors.PRECONDITION_INVALID,
      `Import not found for component(${compName})#${hash} ${dependencyType}:${dependencyName} ${pathType}[${pathValue}]`,
      { component: compName, hash, dependencyType, dependencyName, pathType, pathValue, alias },
    )

    const [nextComponentId] = await g.E(edgeId).inV().id()
    handlerDiagnostics.require(
      nextComponentId,
      Errors.PRECONDITION_INVALID,
      `Import target missing for component(${compName})#${hash} ${dependencyType}:${dependencyName} ${pathType}[${pathValue}]`,
      { component: compName, hash, dependencyType, dependencyName, pathType, pathValue, alias },
    )

    componentId = nextComponentId
  }

  return componentId
}

async function resolveDependencyTargetId({
  handlerDiagnostics,
  dependencyList,
  g,
  componentVID,
  importPath,
  targetType,
  targetName,
  compName,
  hash,
  dependencyType,
  dependencyName,
  dep,
}) {
  const localKey = `${targetType}.${targetName}`
  if (!importPath.length) {
    const match = dependencyList.get(localKey)
    handlerDiagnostics.require(
      match,
      Errors.PRECONDITION_INVALID,
      `Dependency not found for component(${compName})#${hash} ${dependencyType}:${dependencyName} dep[${dep}]`,
      { dep, component: compName, hash, dependencyType, dependencyName },
    )
    return match.id
  }

  handlerDiagnostics.require(
    g,
    Errors.PRECONDITION_REQUIRED,
    `Graph context required for component(${compName})#${hash} ${dependencyType}:${dependencyName} dep[${dep}]`,
    { component: compName, hash, dependencyType, dependencyName, dep },
  )
  handlerDiagnostics.require(
    targetType !== 'deferred',
    Errors.PRECONDITION_INVALID,
    `Unknown dependency type:${targetType} for component(${compName})#${hash} ${dependencyType}:${dependencyName} dep[${dep}]`,
    { type: targetType, dep, component: compName, hash },
  )

  const targetComponentId = await resolveImportedComponent({
    g,
    handlerDiagnostics,
    startComponentId: componentVID,
    importPath,
    compName,
    hash,
    dependencyType,
    dependencyName,
    pathType: 'dep',
    pathValue: dep,
  })

  let edgeLabel = null
  if (targetType === 'task') {
    edgeLabel = domain.edge.has_task.component_task.constants.LABEL
  } else if (targetType === 'data') {
    edgeLabel = domain.edge.has_data.component_data.constants.LABEL
  } else {
    edgeLabel = domain.edge.has_service.component_service.constants.LABEL
  }

  const [targetNodeId] = await g
    .V(targetComponentId)
    .out(edgeLabel)
    .has('name', targetName)
    .id()

  handlerDiagnostics.require(
    targetNodeId,
    Errors.PRECONDITION_INVALID,
    `Dependency not found for component(${compName})#${hash} ${dependencyType}:${dependencyName} dep[${dep}]`,
    { dep, component: compName, hash, dependencyType, dependencyName, importPath, targetType, targetName },
  )

  return targetNodeId
}

export async function linkDataTaskDependencies({
  rootCtx: { g, dataMapper },
  scope: { handlerDiagnostics, dependencyList, componentVID, component },
}) {
  const { name: compName, hash } = component
  for (const [dependencyRef, { id, deps = [] }] of dependencyList.entries()) {
    const [dependencyType, dependencyName] = dependencyRef.split('.')
    for (const dep of deps) {
      const { trimmedDep, importPath, targetType, targetName } = parseDependencyPath({
        handlerDiagnostics,
        dep,
        compName,
        hash,
        dependencyType,
        dependencyName,
      })

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
        dependencyType,
        dependencyName,
        dep: trimmedDep,
      })

      if (dependencyType === 'task') {
        if (targetType === 'task') await dataMapper.edge.has_dependency.task_task.create({ fromId: id, toId: targetId })
        else if (targetType === 'data') await dataMapper.edge.has_dependency.task_data.create({ fromId: id, toId: targetId })
        else if (targetType === 'deferred') await dataMapper.edge.has_dependency.task_deferred.create({ fromId: id, toId: targetId })
        else if (targetType === 'service') await dataMapper.edge.has_dependency.task_service.create({ fromId: id, toId: targetId })
        else handlerDiagnostics.require(false, Errors.PRECONDITION_INVALID, `Unsupported dependency target ${targetType} for task`, { dependencyType, targetType, dependencyName })
      } else if (dependencyType === 'data') {
        if (targetType === 'task') await dataMapper.edge.has_dependency.data_task.create({ fromId: id, toId: targetId })
        else if (targetType === 'data') await dataMapper.edge.has_dependency.data_data.create({ fromId: id, toId: targetId })
        else if (targetType === 'deferred') await dataMapper.edge.has_dependency.data_deferred.create({ fromId: id, toId: targetId })
        else if (targetType === 'service') await dataMapper.edge.has_dependency.data_service.create({ fromId: id, toId: targetId })
        else handlerDiagnostics.require(false, Errors.PRECONDITION_INVALID, `Unsupported dependency target ${targetType} for data`, { dependencyType, targetType, dependencyName })
      } else if (dependencyType === 'service') {
        if (targetType === 'task') await dataMapper.edge.has_dependency.service_task.create({ fromId: id, toId: targetId })
        else if (targetType === 'data') await dataMapper.edge.has_dependency.service_data.create({ fromId: id, toId: targetId })
        else if (targetType === 'service') await dataMapper.edge.has_dependency.service_service.create({ fromId: id, toId: targetId })
        else handlerDiagnostics.require(false, Errors.PRECONDITION_INVALID, `Unsupported dependency target ${targetType} for service`, { dependencyType, targetType, dependencyName })
      }
    }
  }
}
