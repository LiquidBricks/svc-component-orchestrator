import { Errors } from '../../../../../errors.js'
import { parseDependencyPath, resolveDependencyTargetId } from './dependencyPath.js'

export async function linkDataTaskDependencies({
  rootCtx: { g, dataMapper },
  scope: { handlerDiagnostics, dependencyList, componentVID, component },
}) {
  const { name: compName, hash } = component
  const edgeCreators = {
    dependency: {
      task: {
        task: dataMapper.edge.has_dependency.task_task.create,
        data: dataMapper.edge.has_dependency.task_data.create,
        deferred: dataMapper.edge.has_dependency.task_deferred.create,
      },
      data: {
        task: dataMapper.edge.has_dependency.data_task.create,
        data: dataMapper.edge.has_dependency.data_data.create,
        deferred: dataMapper.edge.has_dependency.data_deferred.create,
      },
    },
    waitFor: {
      task: {
        task: dataMapper.edge.wait_for.task_task.create,
        data: dataMapper.edge.wait_for.task_data.create,
      },
      data: {
        task: dataMapper.edge.wait_for.data_task.create,
        data: dataMapper.edge.wait_for.data_data.create,
      },
    },
  }

  async function linkEdges({ dependencyType, dependencyName, values, edgeKind, fromId }) {
    const mapping = edgeCreators?.[edgeKind]?.[dependencyType]
    if (!mapping) return

    for (const dep of values ?? []) {
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

      const createEdge = mapping[targetType]
      handlerDiagnostics.require(
        typeof createEdge === 'function',
        Errors.PRECONDITION_INVALID,
        `Unsupported ${edgeKind} target ${targetType} for ${dependencyType}`,
        { dependencyType, targetType, dependencyName },
      )
      await createEdge({ fromId, toId: targetId })
    }
  }

  for (const [dependencyRef, { id, deps = [], waitFor = [] }] of dependencyList.entries()) {
    const [dependencyType, dependencyName] = dependencyRef.split('.')
    await linkEdges({ dependencyType, dependencyName, values: deps, edgeKind: 'dependency', fromId: id })

    if (waitFor?.length) {
      handlerDiagnostics.require(
        edgeCreators.waitFor?.[dependencyType],
        Errors.PRECONDITION_INVALID,
        `Unsupported waitFor for ${dependencyType}`,
        { dependencyType, dependencyName },
      )
      await linkEdges({ dependencyType, dependencyName, values: waitFor, edgeKind: 'waitFor', fromId: id })
    }
  }
}
