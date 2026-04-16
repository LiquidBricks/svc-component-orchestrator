import { Errors } from '../../../../errors.js'

function validateTaskPayload(diagnostics, task) {
  const { name, fnc, codeRef, deps, waitFor, inject } = task
  diagnostics.require(
    typeof name === 'string' && name.length,
    Errors.PRECONDITION_REQUIRED,
    'task name required',
    { field: 'task.name' },
  )
  diagnostics.require(
    typeof fnc === 'string' && fnc.length,
    Errors.PRECONDITION_REQUIRED,
    'task fnc required',
    { field: 'task.fnc' },
  )
  diagnostics.require(
    typeof codeRef === 'object',
    Errors.PRECONDITION_INVALID,
    'task codeRef required',
    { field: 'task.codeRef' },
  )
  diagnostics.require(
    Array.isArray(deps),
    Errors.PRECONDITION_INVALID,
    'task deps must be an array',
    { field: 'task.deps' },
  )
  diagnostics.require(
    waitFor === undefined || Array.isArray(waitFor),
    Errors.PRECONDITION_INVALID,
    'task waitFor must be an array',
    { field: 'task.waitFor' },
  )
  diagnostics.require(
    inject === undefined || Array.isArray(inject),
    Errors.PRECONDITION_INVALID,
    'task inject must be an array',
    { field: 'task.inject' },
  )
}

function validateDataPayload(diagnostics, dataItem) {
  const { name, codeRef, deps, waitFor, inject } = dataItem
  diagnostics.require(
    typeof name === 'string' && name.length,
    Errors.PRECONDITION_REQUIRED,
    'data name required',
    { field: 'data.name' },
  )
  diagnostics.require(
    Array.isArray(deps),
    Errors.PRECONDITION_INVALID,
    'data deps must be an array',
    { field: 'data.deps' },
  )
  diagnostics.require(
    waitFor === undefined || Array.isArray(waitFor),
    Errors.PRECONDITION_INVALID,
    'data waitFor must be an array',
    { field: 'data.waitFor' },
  )
  diagnostics.require(
    typeof codeRef === 'object',
    Errors.PRECONDITION_INVALID,
    'task codeRef required',
    { field: 'data.codeRef' },
  )
  diagnostics.require(
    inject === undefined || Array.isArray(inject),
    Errors.PRECONDITION_INVALID,
    'data inject must be an array',
    { field: 'data.inject' },
  )
}

export async function buildDependencyList({
  rootCtx: { dataMapper },
  scope: { handlerDiagnostics, component, componentVID },
}) {
  const { data = [], tasks = [] } = component
  const dependencyList = new Map()

  for (const task of tasks) {
    validateTaskPayload(handlerDiagnostics, task)
    const deps = Array.isArray(task.deps) ? task.deps : []
    const waitFor = Array.isArray(task.waitFor) ? task.waitFor : []
    const { id: taskVID } = await dataMapper.vertex.task.create(task)
    await dataMapper.edge.has_task.component_task.create({ fromId: componentVID, toId: taskVID })
    dependencyList.set(`task.${task.name}`, { id: taskVID, deps, waitFor, inject: task.inject })
  }

  for (const dataItem of data) {
    validateDataPayload(handlerDiagnostics, dataItem)
    const deps = Array.isArray(dataItem.deps) ? dataItem.deps : []
    const waitFor = Array.isArray(dataItem.waitFor) ? dataItem.waitFor : []
    const { id: dataVID } = await dataMapper.vertex.data.create(dataItem)
    await dataMapper.edge.has_data.component_data.create({ fromId: componentVID, toId: dataVID })
    dependencyList.set(`data.${dataItem.name}`, { id: dataVID, deps, waitFor, inject: dataItem.inject })
  }

  const { id: deferredVID } = await dataMapper.vertex.deferred.create({ name: 'deferred' })
  await dataMapper.edge.has_deferred.component_deferred.create({ fromId: componentVID, toId: deferredVID })
  dependencyList.set(`deferred.deferred`, { id: deferredVID, deps: [], inject: [] })

  return { dependencyList }
}
