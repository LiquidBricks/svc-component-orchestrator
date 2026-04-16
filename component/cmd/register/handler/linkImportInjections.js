import { Errors } from '../../../../errors.js'
import { domain } from '@liquid-bricks/spec-domain/domain'

function parseImportInjectionPath({ handlerDiagnostics, path, compName, hash, importName, role, refType = 'import' }) {
  const trimmedPath = String(path ?? '').trim()
  const parts = trimmedPath.split('.').filter(Boolean)

  handlerDiagnostics.require(
    parts.length >= 2,
    Errors.PRECONDITION_REQUIRED,
    `Injection ${role} path is required for component(${compName})#${hash} ${refType}:${importName} ${role}[${trimmedPath}]`,
    { component: compName, hash, importName, role, path: trimmedPath, refType },
  )

  const type = parts[parts.length - 2]
  const name = parts[parts.length - 1]
  const importPath = parts.slice(0, parts.length - 2)

  handlerDiagnostics.require(
    ['data', 'task'].includes(type),
    Errors.PRECONDITION_INVALID,
    `Unknown injection type:${type} for component(${compName})#${hash} ${refType}:${importName} ${role}[${trimmedPath}]`,
    { type, path: trimmedPath, component: compName, hash, importName, role, refType },
  )
  handlerDiagnostics.require(
    name,
    Errors.PRECONDITION_REQUIRED,
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

async function resolveImportedComponent({ g, handlerDiagnostics, startComponentId, importPath, compName, hash, importName, pathType, pathValue, refType = 'import' }) {
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
      `${refType === 'gate' ? 'Gate' : 'Import'} not found for component(${compName})#${hash} ${refType}:${importName} ${pathType}[${pathValue}]`,
      { component: compName, hash, importName, pathType, pathValue, alias, refType },
    )

    const [nextComponentId] = await g
      .V(importRefId ?? gateRefId)
      .out(importRefId ? domain.edge.import_of.importRef_component.constants.LABEL : domain.edge.gate_of.gateRef_component.constants.LABEL)
      .id()
    handlerDiagnostics.require(
      nextComponentId,
      Errors.PRECONDITION_INVALID,
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
  refType = 'import',
}) {
  const localKey = `${type}.${name}`
  if (!importPath.length) {
    const match = dependencyList.get(localKey)
    handlerDiagnostics.require(
      match,
      Errors.PRECONDITION_INVALID,
      `Injection ${pathType} not found for component(${compName})#${hash} ${refType}:${importName} ${pathType}[${pathValue}]`,
      { component: compName, hash, importName, pathType, pathValue, refType },
    )
    return match.id
  }

  handlerDiagnostics.require(
    g,
    Errors.PRECONDITION_REQUIRED,
    `Graph context required for component(${compName})#${hash} ${refType}:${importName} ${pathType}[${pathValue}]`,
    { component: compName, hash, importName, pathType, pathValue, refType },
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
    refType,
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
    `Injection ${pathType} not found for component(${compName})#${hash} ${refType}:${importName} ${pathType}[${pathValue}]`,
    { component: compName, hash, importName, pathType, pathValue, importPath, type, name, refType },
  )

  return nodeId
}

function getInjectEdgeLabel({ fromType, toType }) {
  if (fromType === 'task') {
    if (toType === 'task') return domain.edge.injects_into.task_task.constants.LABEL
    if (toType === 'data') return domain.edge.injects_into.task_data.constants.LABEL
  } else if (fromType === 'data') {
    if (toType === 'task') return domain.edge.injects_into.data_task.constants.LABEL
    if (toType === 'data') return domain.edge.injects_into.data_data.constants.LABEL
  }
  return null
}

function createEdgeFactory({ g, dataMapper }) {
  return async function createEdge({ fromType, toType, fromId, toId, targetImportPath = [] }) {
    const edgeLabel = getInjectEdgeLabel({ fromType, toType })
    if (!edgeLabel) return

    const hasTargetImportPath = Array.isArray(targetImportPath) && targetImportPath.length > 0
    if (g && hasTargetImportPath) {
      await g
        .addE(edgeLabel, fromId, toId)
        .property('targetAliasPath', JSON.stringify(targetImportPath))
      return
    }

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
  const gates = component?.gates ?? []
  if (!imports.length && !gates.length) return

  const createEdge = createEdgeFactory({ g, dataMapper })
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
      Errors.PRECONDITION_INVALID,
      `${refType} inject must be an object for component(${compName})#${hash} ${refType}:${importName}`,
      { component: compName, hash, importName, refType },
    )

    for (const [sourcePath, targets] of Object.entries(inject)) {
      handlerDiagnostics.require(
        Array.isArray(targets),
        Errors.PRECONDITION_INVALID,
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
          refType,
        })

        const edgeKey = `${sourceId}:${targetId}:${targetImportPath.join('.')}`
        if (createdEdges.has(edgeKey)) continue
        createdEdges.add(edgeKey)

        await createEdge({
          fromType: sourceType,
          toType: targetType,
          fromId: sourceId,
          toId: targetId,
          targetImportPath,
        })
      }
    }
  }
}
