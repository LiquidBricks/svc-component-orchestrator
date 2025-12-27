import { Errors } from '../../../../errors.js'

function validateTaskPayload(diagnostics, task) {
  const { name, fnc, codeRef, deps, inject } = task
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
    inject === undefined || Array.isArray(inject),
    Errors.PRECONDITION_INVALID,
    'task inject must be an array',
    { field: 'task.inject' },
  )
}

function validateDataPayload(diagnostics, dataItem) {
  const { name, codeRef, deps, inject } = dataItem
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

function validateServicePayload(diagnostics, service) {
  const { name, codeRef, deps, inject } = service
  diagnostics.require(
    typeof name === 'string' && name.length,
    Errors.PRECONDITION_REQUIRED,
    'service name required',
    { field: 'service.name' },
  )
  diagnostics.require(
    Array.isArray(deps),
    Errors.PRECONDITION_INVALID,
    'service deps must be an array',
    { field: 'service.deps' },
  )
  diagnostics.require(
    typeof codeRef === 'object',
    Errors.PRECONDITION_INVALID,
    'service codeRef required',
    { field: 'service.codeRef' },
  )
  diagnostics.require(
    inject === undefined || Array.isArray(inject),
    Errors.PRECONDITION_INVALID,
    'service inject must be an array',
    { field: 'service.inject' },
  )
}

export async function buildDependencyList({
  rootCtx: { dataMapper },
  scope: { handlerDiagnostics, component, componentVID },
}) {
  const { data = [], tasks = [], services = [] } = component
  const dependencyList = new Map()

  for (const task of tasks) {
    validateTaskPayload(handlerDiagnostics, task)
    const { id: taskVID } = await dataMapper.vertex.task.create(task)
    await dataMapper.edge.has_task.component_task.create({ fromId: componentVID, toId: taskVID })
    dependencyList.set(`task.${task.name}`, { id: taskVID, deps: task.deps, inject: task.inject })
  }

  for (const service of services) {
    validateServicePayload(handlerDiagnostics, service)
    const { id: serviceVID } = await dataMapper.vertex.service.create(service)
    await dataMapper.edge.has_service.component_service.create({ fromId: componentVID, toId: serviceVID })
    dependencyList.set(`service.${service.name}`, { id: serviceVID, deps: service.deps, inject: service.inject })
  }

  for (const dataItem of data) {
    validateDataPayload(handlerDiagnostics, dataItem)
    const { id: dataVID } = await dataMapper.vertex.data.create(dataItem)
    await dataMapper.edge.has_data.component_data.create({ fromId: componentVID, toId: dataVID })
    dependencyList.set(`data.${dataItem.name}`, { id: dataVID, deps: dataItem.deps, inject: dataItem.inject })
  }

  const { id: deferredVID } = await dataMapper.vertex.deferred.create({ name: 'deferred' })
  await dataMapper.edge.has_deferred.component_deferred.create({ fromId: componentVID, toId: deferredVID })
  dependencyList.set(`deferred.deferred`, { id: deferredVID, deps: [], inject: [] })

  return { dependencyList }
}
