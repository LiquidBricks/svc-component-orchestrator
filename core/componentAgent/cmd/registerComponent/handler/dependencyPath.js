import { PRECONDITION_INVALID, PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes'

const SUPPORTED_DEPENDENCY_TYPES = ['data', 'task', 'deferred', 'lifecycle', 'agentFn']

export function parseDependencyPath({ handlerDiagnostics, dep, compName, hash, dependencyType, dependencyName }) {
  const trimmedDep = String(dep ?? '').trim()
  const parts = trimmedDep.split('.').filter(Boolean)

  handlerDiagnostics.require(
    parts.length >= 2,
    PRECONDITION_REQUIRED,
    `Dependency path is required for component(${compName})#${hash} ${dependencyType}:${dependencyName} dep[${trimmedDep}]`,
    { component: compName, hash, dependencyType, dependencyName, dep: trimmedDep },
  )

  const targetType = parts[parts.length - 2]
  const targetName = parts[parts.length - 1]
  const importPath = parts.slice(0, parts.length - 2)

  handlerDiagnostics.require(
    SUPPORTED_DEPENDENCY_TYPES.includes(targetType),
    PRECONDITION_INVALID,
    `Unknown dependency type:${targetType} for component(${compName})#${hash} ${dependencyType}:${dependencyName} dep[${trimmedDep}]`,
    { type: targetType, dep: trimmedDep, component: compName, hash },
  )
  handlerDiagnostics.require(
    targetName,
    PRECONDITION_REQUIRED,
    `Dependency name is required for component(${compName})#${hash} ${dependencyType}:${dependencyName} dep[${trimmedDep}]`,
    { component: compName, hash, dependencyType, dependencyName },
  )
  handlerDiagnostics.require(
    targetType !== 'lifecycle' || targetName === 'done',
    PRECONDITION_INVALID,
    `Lifecycle dependency only supports done for component(${compName})#${hash} ${dependencyType}:${dependencyName} dep[${trimmedDep}]`,
    { component: compName, hash, dependencyType, dependencyName, dep: trimmedDep, lifecycle: targetName },
  )
  handlerDiagnostics.require(
    targetType !== 'lifecycle' || importPath.length > 0,
    PRECONDITION_INVALID,
    `Lifecycle dependency must reference an import for component(${compName})#${hash} ${dependencyType}:${dependencyName} dep[${trimmedDep}]`,
    { component: compName, hash, dependencyType, dependencyName, dep: trimmedDep },
  )
  handlerDiagnostics.require(
    targetType !== 'deferred' || importPath.length === 0,
    PRECONDITION_INVALID,
    `Deferred dependency cannot reference imports for component(${compName})#${hash} ${dependencyType}:${dependencyName} dep[${trimmedDep}]`,
    { component: compName, hash, dependencyType, dependencyName, dep: trimmedDep },
  )
  handlerDiagnostics.require(
    targetType !== 'agentFn' || importPath.length === 0,
    PRECONDITION_INVALID,
    `agentFn dependency cannot reference imports for component(${compName})#${hash} ${dependencyType}:${dependencyName} dep[${trimmedDep}]`,
    { component: compName, hash, dependencyType, dependencyName, dep: trimmedDep },
  )

  return {
    trimmedDep,
    importPath,
    targetType,
    targetName,
  }
}

export function validateAgentFnDependency({
  handlerDiagnostics,
  agentFns = [],
  targetName,
  compName,
  hash,
  dependencyType,
  dependencyName,
  dep,
}) {
  const list = Array.isArray(agentFns) ? agentFns : []
  const match = list.find(({ name }) => name === targetName)
  handlerDiagnostics.require(
    match,
    PRECONDITION_INVALID,
    `agentFn not found for component(${compName})#${hash} ${dependencyType}:${dependencyName} dep[${dep}]`,
    { dep, component: compName, hash, dependencyType, dependencyName, agentFn: targetName },
  )
  return match
}

async function resolveImportedComponent({
  g, dataMapper,
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
    const [importRefId] = await dataMapper.query.findImportRefIdByAlias({ alias, vertexId: componentId })

    const [gateRefId] = importRefId ? [] : await dataMapper.query.findGateRefIdByAlias({ alias, vertexId: componentId })
    const [nextComponentId] = importRefId
      ? await dataMapper.query.findImportedComponentIdForImportRef({ vertexId: importRefId })
      : await dataMapper.query.findGatedComponentIdForGateRef({ vertexId: gateRefId })

    handlerDiagnostics.require(
      importRefId || gateRefId,
      PRECONDITION_INVALID,
      `Import not found for component(${compName})#${hash} ${dependencyType}:${dependencyName} ${pathType}[${pathValue}]`,
      { component: compName, hash, dependencyType, dependencyName, pathType, pathValue, alias },
    )

    handlerDiagnostics.require(
      nextComponentId,
      PRECONDITION_INVALID,
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
  g, dataMapper,
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
      PRECONDITION_REQUIRED,
      `Graph context required for component(${compName})#${hash} ${dependencyType}:${dependencyName} dep[${dep}]`,
      { component: compName, hash, dependencyType, dependencyName, dep },
    )

    await resolveImportedComponent({
      g, dataMapper,
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
      PRECONDITION_INVALID,
      `Dependency not found for component(${compName})#${hash} ${dependencyType}:${dependencyName} dep[${dep}]`,
      { dep, component: compName, hash, dependencyType, dependencyName },
    )
    return match.id
  }

  handlerDiagnostics.require(
    g,
    PRECONDITION_REQUIRED,
    `Graph context required for component(${compName})#${hash} ${dependencyType}:${dependencyName} dep[${dep}]`,
    { component: compName, hash, dependencyType, dependencyName, dep },
  )
  handlerDiagnostics.require(
    targetType !== 'deferred',
    PRECONDITION_INVALID,
    `Unknown dependency type:${targetType} for component(${compName})#${hash} ${dependencyType}:${dependencyName} dep[${dep}]`,
    { type: targetType, dep, component: compName, hash },
  )

  const targetComponentId = await resolveImportedComponent({
    g, dataMapper,
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

  const [targetNodeId] = targetType === 'task'
    ? await dataMapper.query.findComponentTaskNodeIdByName({ name: targetName, vertexId: targetComponentId })
    : await dataMapper.query.findComponentDataNodeIdByName({ name: targetName, vertexId: targetComponentId })

  handlerDiagnostics.require(
    targetNodeId,
    PRECONDITION_INVALID,
    `Dependency not found for component(${compName})#${hash} ${dependencyType}:${dependencyName} dep[${dep}]`,
    { dep, component: compName, hash, dependencyType, dependencyName, importPath, targetType, targetName },
  )

  return targetNodeId
}
