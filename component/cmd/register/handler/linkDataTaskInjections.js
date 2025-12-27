import { Errors } from '../../../../errors.js'
import { domain } from '@liquid-bricks/spec-domain/domain'

function parseInjectionPath({ handlerDiagnostics, injection, compName, hash, dependencyType, dependencyName }) {
  const trimmedInjection = String(injection ?? '').trim()
  const parts = trimmedInjection.split('.').filter(Boolean)

  handlerDiagnostics.require(
    parts.length >= 2,
    Errors.PRECONDITION_REQUIRED,
    `Injection path is required for component(${compName})#${hash} ${dependencyType}:${dependencyName} inject[${trimmedInjection}]`,
    { component: compName, hash, dependencyType, dependencyName, inject: trimmedInjection },
  )

  const targetType = parts[parts.length - 2]
  const targetName = parts[parts.length - 1]

  handlerDiagnostics.require(
    ['data', 'task'].includes(targetType),
    Errors.PRECONDITION_INVALID,
    `Unknown injection type:${targetType} for component(${compName})#${hash} ${dependencyType}:${dependencyName} inject[${trimmedInjection}]`,
    { type: targetType, inject: trimmedInjection, component: compName, hash, dependencyType, dependencyName },
  )
  handlerDiagnostics.require(
    targetName,
    Errors.PRECONDITION_REQUIRED,
    `Injection name is required for component(${compName})#${hash} ${dependencyType}:${dependencyName} inject[${trimmedInjection}]`,
    { component: compName, hash, dependencyType, dependencyName, inject: trimmedInjection },
  )

  return {
    trimmedInjection,
    importPath: parts.slice(0, parts.length - 2),
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

async function resolveInjectionTargetId({
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
  inject,
}) {
  const localKey = `${targetType}.${targetName}`
  if (!importPath.length) {
    const match = dependencyList.get(localKey)
    handlerDiagnostics.require(
      match,
      Errors.PRECONDITION_INVALID,
      `Injection target not found for component(${compName})#${hash} ${dependencyType}:${dependencyName} inject[${inject}]`,
      { inject, component: compName, hash, dependencyType, dependencyName },
    )
    return match.id
  }

  handlerDiagnostics.require(
    g,
    Errors.PRECONDITION_REQUIRED,
    `Graph context required for component(${compName})#${hash} ${dependencyType}:${dependencyName} inject[${inject}]`,
    { component: compName, hash, dependencyType, dependencyName, inject },
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
    pathType: 'inject',
    pathValue: inject,
  })

  const edgeLabel = targetType === 'task'
    ? domain.edge.has_task.component_task.constants.LABEL
    : domain.edge.has_data.component_data.constants.LABEL

  const [targetNodeId] = await g
    .V(targetComponentId)
    .out(edgeLabel)
    .has('name', targetName)
    .id()

  handlerDiagnostics.require(
    targetNodeId,
    Errors.PRECONDITION_INVALID,
    `Injection target not found for component(${compName})#${hash} ${dependencyType}:${dependencyName} inject[${inject}]`,
    { inject, component: compName, hash, dependencyType, dependencyName, importPath, targetType, targetName },
  )

  return targetNodeId
}

export async function linkDataTaskInjections({
  rootCtx: { g, dataMapper },
  scope: { handlerDiagnostics, dependencyList, componentVID, component },
}) {
  const { name: compName, hash } = component
  for (const [dependencyRef, { id, inject = [] }] of dependencyList.entries()) {
    const [dependencyType, dependencyName] = dependencyRef.split('.')
    if (!['task', 'data'].includes(dependencyType)) continue
    for (const injection of inject) {
      const { trimmedInjection, importPath, targetType, targetName } = parseInjectionPath({
        handlerDiagnostics,
        injection,
        compName,
        hash,
        dependencyType,
        dependencyName,
      })

      const targetId = await resolveInjectionTargetId({
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
        inject: trimmedInjection,
      })

      if (dependencyType === 'task') {
        if (targetType === 'task') await dataMapper.edge.injects_into.task_task.create({ fromId: id, toId: targetId })
        if (targetType === 'data') await dataMapper.edge.injects_into.task_data.create({ fromId: id, toId: targetId })
      } else if (dependencyType === 'data') {
        if (targetType === 'task') await dataMapper.edge.injects_into.data_task.create({ fromId: id, toId: targetId })
        if (targetType === 'data') await dataMapper.edge.injects_into.data_data.create({ fromId: id, toId: targetId })
      }
    }
  }
}
