import { domain } from '@liquid-bricks/spec-domain/domain'

const PROVIDED_STATUS_BY_TYPE = Object.freeze({
  data: domain.edge.has_data_state.stateMachine_data.constants.Status.PROVIDED,
  task: domain.edge.has_task_state.stateMachine_task.constants.Status.PROVIDED,
})

function first(value) {
  return Array.isArray(value) ? value[0] : value
}

function statusFrom(value) {
  const row = first(value)
  return first(row?.status ?? row)
}

async function findProvidedStatesForType({ dataMapper, stateEdgeIds, type }) {
  const states = await Promise.all(
    Array.from(new Set(stateEdgeIds ?? [])).map(async (stateEdgeId) => {
      const status = statusFrom(
        await dataMapper.query.readStateEdgeStatus({ edgeId: stateEdgeId }),
      )
      if (status !== PROVIDED_STATUS_BY_TYPE[type]) return null

      return {
        stateEdgeId: String(stateEdgeId),
        type,
      }
    }),
  )

  return states.filter(Boolean)
}

export async function findProvidedStates({
  rootCtx: { dataMapper },
  scope: { stateMachineId },
}) {
  const [dataStateEdgeIds, taskStateEdgeIds] = await Promise.all([
    dataMapper.query.listDataStateEdgeIds({ vertexId: stateMachineId }),
    dataMapper.query.listTaskStateEdgeIds({ vertexId: stateMachineId }),
  ])
  const [dataStates, taskStates] = await Promise.all([
    findProvidedStatesForType({ dataMapper, stateEdgeIds: dataStateEdgeIds, type: 'data' }),
    findProvidedStatesForType({ dataMapper, stateEdgeIds: taskStateEdgeIds, type: 'task' }),
  ])

  return {
    providedStates: [...dataStates, ...taskStates],
  }
}
