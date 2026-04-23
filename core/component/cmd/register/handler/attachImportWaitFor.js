import { domain } from '@liquid-bricks/spec-domain/domain'
import { parseDependencyPath, resolveDependencyTargetId } from './dependencyPath.js'
import { Errors } from '../../../../../errors.js'

export async function attachImportWaitFor({
  rootCtx: { g, dataMapper },
  scope: { handlerDiagnostics, component, dependencyList, componentVID },
}) {
  const { name: compName, hash, imports = [] } = component ?? {}
  if (!imports.length) return

  for (const importItem of imports) {
    const { name: importName, waitFor = [] } = importItem ?? {}
    const waitForTargets = {
      task: new Set(),
      data: new Set(),
    }

    for (const dep of waitFor ?? []) {
      const { trimmedDep, importPath, targetType, targetName } = parseDependencyPath({
        handlerDiagnostics,
        dep,
        compName,
        hash,
        dependencyType: 'import',
        dependencyName: importName,
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
        dependencyType: 'import',
        dependencyName: importName,
        dep: trimmedDep,
      })

      if (targetId) {
        handlerDiagnostics.require(
          targetType === 'task' || targetType === 'data',
          Errors.PRECONDITION_INVALID,
          `import waitFor only supports data/task for component(${compName})#${hash} import:${importName} dep[${trimmedDep}]`,
          { component: compName, hash, importName, dep: trimmedDep, type: targetType },
        )
        if (targetType === 'task') waitForTargets.task.add(targetId)
        if (targetType === 'data') waitForTargets.data.add(targetId)
      }
    }

    const [importRefId] = await g
      .V(componentVID)
      .out(domain.edge.has_import.component_importRef.constants.LABEL)
      .has('alias', importName)
      .id()

    handlerDiagnostics.require(
      importRefId,
      Errors.PRECONDITION_INVALID,
      `Import ref missing for component(${compName})#${hash} import:${importName}`,
      { component: compName, hash, importName },
    )

    for (const targetId of waitForTargets.task) {
      await dataMapper.edge.wait_for.importRef_task.create({ fromId: importRefId, toId: targetId })
    }
    for (const targetId of waitForTargets.data) {
      await dataMapper.edge.wait_for.importRef_data.create({ fromId: importRefId, toId: targetId })
    }
  }
}
