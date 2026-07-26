function readProperty(row, property) {
  const value = row?.[property] ?? row
  return Array.isArray(value) ? value[0] : value
}

async function addNodeStateKeys({ dataMapper, state, type, nodeIds }) {
  for (const nodeId of nodeIds ?? []) {
    if (!nodeId) continue
    const [row] = await dataMapper.query.readNodeName({ vertexId: nodeId })
    const name = readProperty(row, 'name')
    if (name === undefined || name === null || name === '') continue
    state[`${type}.${name}`] = null
  }
}

async function buildInitialState({ dataMapper, componentId }) {
  const dataNodeIds = await dataMapper.query.listDataNodeIds({ vertexId: componentId })
  const taskNodeIds = await dataMapper.query.listTaskNodeIds({ vertexId: componentId })
  const gateRefIds = await dataMapper.query.listGateRefIds({ vertexId: componentId })
  const state = {}

  await addNodeStateKeys({ dataMapper, state, type: 'data', nodeIds: dataNodeIds })
  await addNodeStateKeys({ dataMapper, state, type: 'task', nodeIds: taskNodeIds })

  for (const gateRefId of gateRefIds ?? []) {
    if (!gateRefId) continue
    const [row] = await dataMapper.query.readGateRefAlias({ vertexId: gateRefId })
    const alias = readProperty(row, 'alias')
    if (alias === undefined || alias === null || alias === '') continue
    state[`gate.${alias}`] = null
  }

  return { dataNodeIds, taskNodeIds, state }
}

export async function createComponentInstance({
  g,
  dataMapper,
  componentId,
  componentHash,
  instanceId,
}) {
  const { dataNodeIds, taskNodeIds, state } = await buildInitialState({ dataMapper, componentId })
  const { id: instanceVertexId } = await dataMapper.vertex.componentInstance.create({ instanceId })
  await dataMapper.edge.instance_of.componentInstance_component.create({ fromId: instanceVertexId, toId: componentId })

  const { id: stateMachineId } = await dataMapper.vertex.stateMachine.create()
  await dataMapper.edge.has_stateMachine.componentInstance_stateMachine.create({ fromId: instanceVertexId, toId: stateMachineId })

  for (const nodeId of dataNodeIds ?? []) {
    if (!nodeId) continue
    await dataMapper.edge.has_data_state.stateMachine_data.create({ fromId: stateMachineId, toId: nodeId })
  }

  for (const taskId of taskNodeIds ?? []) {
    if (!taskId) continue
    await dataMapper.edge.has_task_state.stateMachine_task.create({ fromId: stateMachineId, toId: taskId })
  }

  return {
    instanceId,
    instanceVertexId,
    componentId,
    componentHash: readProperty(componentHash, 'hash'),
    stateMachineId,
    state,
  }
}
