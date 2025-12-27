import { Errors } from '../../../../errors.js'
import { domain } from '@liquid-bricks/spec-domain/domain'

function parseImportInjectionPath({ handlerDiagnostics, path, compName, hash, importName, role }) {
  const trimmedPath = String(path ?? '').trim()
  const parts = trimmedPath.split('.').filter(Boolean)

  handlerDiagnostics.require(
    parts.length >= 2,
    Errors.PRECONDITION_REQUIRED,
    `Injection ${role} path is required for component(${compName})#${hash} import:${importName} ${role}[${trimmedPath}]`,
    { component: compName, hash, importName, role, path: trimmedPath },
  )

  const type = parts[parts.length - 2]
  const name = parts[parts.length - 1]
  const importPath = parts.slice(0, parts.length - 2)

  handlerDiagnostics.require(
    ['data', 'task'].includes(type),
    Errors.PRECONDITION_INVALID,
    `Unknown injection type:${type} for component(${compName})#${hash} import:${importName} ${role}[${trimmedPath}]`,
    { type, path: trimmedPath, component: compName, hash, importName, role },
  )
  handlerDiagnostics.require(
    name,
    Errors.PRECONDITION_REQUIRED,
    `Injection name is required for component(${compName})#${hash} import:${importName} ${role}[${trimmedPath}]`,
    { component: compName, hash, importName, role, path: trimmedPath },
  )

  return {
    trimmedPath,
    importPath,
    type,
    name,
  }
}

async function resolveImportedComponent({ g, handlerDiagnostics, startComponentId, importPath, compName, hash, importName, pathType, pathValue }) {
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
      `Import not found for component(${compName})#${hash} import:${importName} ${pathType}[${pathValue}]`,
      { component: compName, hash, importName, pathType, pathValue, alias },
    )

    const [nextComponentId] = await g.E(edgeId).inV().id()
    handlerDiagnostics.require(
      nextComponentId,
      Errors.PRECONDITION_INVALID,
      `Import target missing for component(${compName})#${hash} import:${importName} ${pathType}[${pathValue}]`,
      { component: compName, hash, importName, pathType, pathValue, alias },
    )

    componentId = nextComponentId
  }

  return componentId
}

async function resolveInjectionNodeId({
  handlerDiagnostics,
  dependencyList,
  g,
  componentVID,
  importPath,
  type,
  name,
  compName,
  hash,
  importName,
  pathType,
  pathValue,
}) {
  const localKey = `${type}.${name}`
  if (!importPath.length) {
    const match = dependencyList.get(localKey)
    handlerDiagnostics.require(
      match,
      Errors.PRECONDITION_INVALID,
      `Injection ${pathType} not found for component(${compName})#${hash} import:${importName} ${pathType}[${pathValue}]`,
      { component: compName, hash, importName, pathType, pathValue },
    )
    return match.id
  }

  handlerDiagnostics.require(
    g,
    Errors.PRECONDITION_REQUIRED,
    `Graph context required for component(${compName})#${hash} import:${importName} ${pathType}[${pathValue}]`,
    { component: compName, hash, importName, pathType, pathValue },
  )

  const targetComponentId = await resolveImportedComponent({
    g,
    handlerDiagnostics,
    startComponentId: componentVID,
    importPath,
    compName,
    hash,
    importName,
    pathType,
    pathValue,
  })

  const edgeLabel = type === 'task'
    ? domain.edge.has_task.component_task.constants.LABEL
    : domain.edge.has_data.component_data.constants.LABEL

  const [nodeId] = await g
    .V(targetComponentId)
    .out(edgeLabel)
    .has('name', name)
    .id()

  handlerDiagnostics.require(
    nodeId,
    Errors.PRECONDITION_INVALID,
    `Injection ${pathType} not found for component(${compName})#${hash} import:${importName} ${pathType}[${pathValue}]`,
    { component: compName, hash, importName, pathType, pathValue, importPath, type, name },
  )

  return nodeId
}

function createEdgeFactory({ dataMapper }) {
  return async function createEdge({ fromType, toType, fromId, toId }) {
    if (fromType === 'task') {
      if (toType === 'task') await dataMapper.edge.injects_into.task_task.create({ fromId, toId })
      if (toType === 'data') await dataMapper.edge.injects_into.task_data.create({ fromId, toId })
    } else if (fromType === 'data') {
      if (toType === 'task') await dataMapper.edge.injects_into.data_task.create({ fromId, toId })
      if (toType === 'data') await dataMapper.edge.injects_into.data_data.create({ fromId, toId })
    }
  }
}

export async function linkImportInjections({
  rootCtx: { g, dataMapper },
  scope: { handlerDiagnostics, dependencyList, componentVID, component },
}) {
  const { name: compName, hash } = component
  const imports = component?.imports ?? []
  if (!imports.length) return

  const createEdge = createEdgeFactory({ dataMapper })
  const createdEdges = new Set()

  for (const importItem of imports) {
    const { name: importName, inject } = importItem
    if (inject === undefined) continue

    handlerDiagnostics.require(
      inject && typeof inject === 'object' && !Array.isArray(inject),
      Errors.PRECONDITION_INVALID,
      `import inject must be an object for component(${compName})#${hash} import:${importName}`,
      { component: compName, hash, importName },
    )

    for (const [sourcePath, targets] of Object.entries(inject)) {
      handlerDiagnostics.require(
        Array.isArray(targets),
        Errors.PRECONDITION_INVALID,
        `import inject targets must be an array for component(${compName})#${hash} import:${importName} source[${sourcePath}]`,
        { component: compName, hash, importName, source: sourcePath },
      )

      const { importPath: sourceImportPath, type: sourceType, name: sourceName, trimmedPath: trimmedSourcePath } =
        parseImportInjectionPath({
          handlerDiagnostics,
          path: sourcePath,
          compName,
          hash,
          importName,
          role: 'source',
        })

      const sourceId = await resolveInjectionNodeId({
        handlerDiagnostics,
        dependencyList,
        g,
        componentVID,
        importPath: sourceImportPath,
        type: sourceType,
        name: sourceName,
        compName,
        hash,
        importName,
        pathType: 'source',
        pathValue: trimmedSourcePath,
      })

      for (const targetPath of targets) {
        const { importPath: targetImportPath, type: targetType, name: targetName, trimmedPath: trimmedTargetPath } =
          parseImportInjectionPath({
            handlerDiagnostics,
            path: targetPath,
            compName,
            hash,
            importName,
            role: 'target',
          })

        const targetId = await resolveInjectionNodeId({
          handlerDiagnostics,
          dependencyList,
          g,
          componentVID,
          importPath: targetImportPath,
          type: targetType,
          name: targetName,
          compName,
          hash,
          importName,
          pathType: 'target',
          pathValue: trimmedTargetPath,
        })

        const edgeKey = `${sourceId}:${targetId}`
        if (createdEdges.has(edgeKey)) continue
        createdEdges.add(edgeKey)

        await createEdge({ fromType: sourceType, toType: targetType, fromId: sourceId, toId: targetId })
      }
    }
  }
}
