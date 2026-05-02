import { Errors } from '../../../../../errors.js'
import { domain } from '@liquid-bricks/spec-domain/domain'

const SUPPORTED_DEPENDENCY_TYPES = ['data', 'task', 'deferred', 'lifecycle']

export function parseDependencyPath({ handlerDiagnostics, dep, compName, hash, dependencyType, dependencyName }) {
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
    SUPPORTED_DEPENDENCY_TYPES.includes(targetType),
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
    targetType !== 'lifecycle' || targetName === 'done',
    Errors.PRECONDITION_INVALID,
    `Lifecycle dependency only supports done for component(${compName})#${hash} ${dependencyType}:${dependencyName} dep[${trimmedDep}]`,
    { component: compName, hash, dependencyType, dependencyName, dep: trimmedDep, lifecycle: targetName },
  )
  handlerDiagnostics.require(
    targetType !== 'lifecycle' || importPath.length > 0,
    Errors.PRECONDITION_INVALID,
    `Lifecycle dependency must reference an import for component(${compName})#${hash} ${dependencyType}:${dependencyName} dep[${trimmedDep}]`,
    { component: compName, hash, dependencyType, dependencyName, dep: trimmedDep },
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

async function resolveImportedComponent({
  g,
  handlerDiagnostics,
  startComponentId,
  importPath,
  compName,
  hash,
  dependencyType,
  dependencyName,
  pathType,
  pathValue,
}) {
  let componentId = startComponentId
  for (const alias of importPath) {
    const [importRefId] = await g
      .V(componentId)
      .out(domain.edge.has_import.component_importRef.constants.LABEL)
      .has('alias', alias)
      .id()

    const [gateRefId] = importRefId ? [] : await g
      .V(componentId)
      .out(domain.edge.has_gate.component_gateRef.constants.LABEL)
      .has('alias', alias)
      .id()

    handlerDiagnostics.require(
      importRefId || gateRefId,
      Errors.PRECONDITION_INVALID,
      `Import not found for component(${compName})#${hash} ${dependencyType}:${dependencyName} ${pathType}[${pathValue}]`,
      { component: compName, hash, dependencyType, dependencyName, pathType, pathValue, alias },
    )

    const [nextComponentId] = await g
      .V(importRefId ?? gateRefId)
      .out(importRefId ? domain.edge.import_of.importRef_component.constants.LABEL : domain.edge.gate_of.gateRef_component.constants.LABEL)
      .id()
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

export async function resolveDependencyTargetId({
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
  if (targetType === 'lifecycle') {
    handlerDiagnostics.require(
      g,
      Errors.PRECONDITION_REQUIRED,
      `Graph context required for component(${compName})#${hash} ${dependencyType}:${dependencyName} dep[${dep}]`,
      { component: compName, hash, dependencyType, dependencyName, dep },
    )

    await resolveImportedComponent({
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

    return dep
  }

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
  }

  handlerDiagnostics.require(
    !!edgeLabel,
    Errors.PRECONDITION_INVALID,
    `Unknown dependency type:${targetType} for component(${compName})#${hash} ${dependencyType}:${dependencyName} dep[${dep}]`,
    { type: targetType, dep, component: compName, hash },
  )

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
