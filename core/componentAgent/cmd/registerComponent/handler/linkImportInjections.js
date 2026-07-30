import { PRECONDITION_INVALID, PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes'

function parseImportInjectionPath({ handlerDiagnostics, path, compName, hash, importName, role, refType = 'import' }) {
  const trimmedPath = String(path ?? '').trim()
  const parts = trimmedPath.split('.').filter(Boolean)

  handlerDiagnostics.require(
    parts.length >= 2,
    PRECONDITION_REQUIRED,
    `Injection ${role} path is required for component(${compName})#${hash} ${refType}:${importName} ${role}[${trimmedPath}]`,
    { component: compName, hash, importName, role, path: trimmedPath, refType },
  )

  const type = parts[parts.length - 2]
  const name = parts[parts.length - 1]
  const importPath = parts.slice(0, parts.length - 2)

  handlerDiagnostics.require(
    ['data', 'task'].includes(type),
    PRECONDITION_INVALID,
    `Unknown injection type:${type} for component(${compName})#${hash} ${refType}:${importName} ${role}[${trimmedPath}]`,
    { type, path: trimmedPath, component: compName, hash, importName, role, refType },
  )
  handlerDiagnostics.require(
    name,
    PRECONDITION_REQUIRED,
    `Injection name is required for component(${compName})#${hash} ${refType}:${importName} ${role}[${trimmedPath}]`,
    { component: compName, hash, importName, role, path: trimmedPath, refType },
  )

  return {
    trimmedPath,
    importPath,
    type,
    name,
  }
}

async function resolveImportedComponent({ g, dataMapper, handlerDiagnostics, startComponentId, importPath, compName, hash, importName, pathType, pathValue, refType = 'import' }) {
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
      `${refType === 'gate' ? 'Gate' : 'Import'} not found for component(${compName})#${hash} ${refType}:${importName} ${pathType}[${pathValue}]`,
      { component: compName, hash, importName, pathType, pathValue, alias, refType },
    )

    handlerDiagnostics.require(
      nextComponentId,
      PRECONDITION_INVALID,
      `${refType === 'gate' ? 'Gate' : 'Import'} target missing for component(${compName})#${hash} ${refType}:${importName} ${pathType}[${pathValue}]`,
      { component: compName, hash, importName, pathType, pathValue, alias, refType },
    )

    componentId = nextComponentId
  }

  return componentId
}

async function resolveInjectionNodeId({
  handlerDiagnostics,
  dependencyList,
  g, dataMapper,
  componentVID,
  importPath,
  type,
  name,
  compName,
  hash,
  importName,
  pathType,
  pathValue,
  refType = 'import',
}) {
  const localKey = `${type}.${name}`
  if (!importPath.length) {
    const match = dependencyList.get(localKey)
    handlerDiagnostics.require(
      match,
      PRECONDITION_INVALID,
      `Injection ${pathType} not found for component(${compName})#${hash} ${refType}:${importName} ${pathType}[${pathValue}]`,
      { component: compName, hash, importName, pathType, pathValue, refType },
    )
    return match.id
  }

  handlerDiagnostics.require(
    g,
    PRECONDITION_REQUIRED,
    `Graph context required for component(${compName})#${hash} ${refType}:${importName} ${pathType}[${pathValue}]`,
    { component: compName, hash, importName, pathType, pathValue, refType },
  )

  const targetComponentId = await resolveImportedComponent({
    g, dataMapper,
    handlerDiagnostics,
    startComponentId: componentVID,
    importPath,
    compName,
    hash,
    importName,
    pathType,
    pathValue,
    refType,
  })

  const [nodeId] = type === 'task'
    ? await dataMapper.query.findImportInjectionTaskTargetNodeIdByName({ name, vertexId: targetComponentId })
    : await dataMapper.query.findImportInjectionDataTargetNodeIdByName({ name, vertexId: targetComponentId })

  handlerDiagnostics.require(
    nodeId,
    PRECONDITION_INVALID,
    `Injection ${pathType} not found for component(${compName})#${hash} ${refType}:${importName} ${pathType}[${pathValue}]`,
    { component: compName, hash, importName, pathType, pathValue, importPath, type, name, refType },
  )

  return nodeId
}

function createEdgeFactory({ dataMapper, ownerComponentId }) {
  return async function createEdge({ fromType, toType, fromId, toId, sourceImportPath = [], targetImportPath = [] }) {
    const payload = {
      fromId,
      toId,
      ownerComponentId,
      sourceAliasPath: JSON.stringify(sourceImportPath),
      targetAliasPath: JSON.stringify(targetImportPath),
    }

    if (fromType === 'task') {
      if (toType === 'task') {
        await dataMapper.edge.injects_into.task_task.create(payload)
      }
      if (toType === 'data') {
        await dataMapper.edge.injects_into.task_data.create(payload)
      }
    } else if (fromType === 'data') {
      if (toType === 'task') {
        await dataMapper.edge.injects_into.data_task.create(payload)
      }
      if (toType === 'data') {
        await dataMapper.edge.injects_into.data_data.create(payload)
      }
    }
  }
}

export async function linkImportInjections({
  rootCtx: { g, dataMapper },
  scope: { handlerDiagnostics, dependencyList, componentVID, component, componentAlreadyRegistered },
}) {
  if (componentAlreadyRegistered) return
  const { name: compName, hash } = component
  const imports = component?.imports ?? []
  const gates = component?.gates ?? []
  if (!imports.length && !gates.length) return

  const createEdge = createEdgeFactory({ dataMapper, ownerComponentId: componentVID })
  const createdEdges = new Set()

  const refEntries = [
    ...imports.map(importItem => ({ refType: 'import', refItem: importItem })),
    ...gates.map(gateItem => ({ refType: 'gate', refItem: gateItem })),
  ]

  for (const { refType, refItem } of refEntries) {
    const { name: importName, inject } = refItem ?? {}
    if (inject === undefined) continue

    handlerDiagnostics.require(
      inject && typeof inject === 'object' && !Array.isArray(inject),
      PRECONDITION_INVALID,
      `${refType} inject must be an object for component(${compName})#${hash} ${refType}:${importName}`,
      { component: compName, hash, importName, refType },
    )

    for (const [sourcePath, targets] of Object.entries(inject)) {
      handlerDiagnostics.require(
        Array.isArray(targets),
        PRECONDITION_INVALID,
        `${refType} inject targets must be an array for component(${compName})#${hash} ${refType}:${importName} source[${sourcePath}]`,
        { component: compName, hash, importName, source: sourcePath, refType },
      )

      const { importPath: sourceImportPath, type: sourceType, name: sourceName, trimmedPath: trimmedSourcePath } =
        parseImportInjectionPath({
          handlerDiagnostics,
          path: sourcePath,
          compName,
          hash,
          importName,
          role: 'source',
          refType,
        })

      const sourceId = await resolveInjectionNodeId({
        handlerDiagnostics,
        dependencyList,
        g, dataMapper,
        componentVID,
        importPath: sourceImportPath,
        type: sourceType,
        name: sourceName,
        compName,
        hash,
        importName,
        pathType: 'source',
        pathValue: trimmedSourcePath,
        refType,
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
            refType,
          })

        const targetId = await resolveInjectionNodeId({
          handlerDiagnostics,
          dependencyList,
          g, dataMapper,
          componentVID,
          importPath: targetImportPath,
          type: targetType,
          name: targetName,
          compName,
          hash,
          importName,
          pathType: 'target',
          pathValue: trimmedTargetPath,
          refType,
        })

        const edgeKey = `${sourceId}:${sourceImportPath.join('.')}:${targetId}:${targetImportPath.join('.')}`
        if (createdEdges.has(edgeKey)) continue
        createdEdges.add(edgeKey)

        await createEdge({
          fromType: sourceType,
          toType: targetType,
          fromId: sourceId,
          toId: targetId,
          sourceImportPath,
          targetImportPath,
        })
      }
    }
  }
}
