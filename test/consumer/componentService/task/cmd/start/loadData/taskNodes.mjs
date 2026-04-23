import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { taskNodes } from '../../../../../../../core/task/cmd/start/loadData/taskNodes.js'
import { componentImports } from '../../../../../../../core/componentInstance/cmd/create/loadData/componentImports.js'
import {
  withGraphContext,
  registerComponent,
  createInstance,
  domain,
} from '../../../../helpers.mjs'

function pickFirst(value) {
  return Array.isArray(value) ? value[0] : value
}

test('taskNodes returns task and component details for state edge', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('TaskNodesComponent')
      .task('taskA', {})
      .toJSON()

    await registerComponent({ diagnostics, dataMapper, g }, component)

    const [componentId] = await g
      .V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', component.hash)
      .id()

    const { imports } = await componentImports({ rootCtx: { g }, scope: { componentId } })

    const instanceId = 'instance-task-nodes'
    await createInstance({ diagnostics, dataMapper, g }, {
      componentHash: component.hash,
      componentId,
      instanceId,
      imports,
    })

    const [instanceVertexId] = await g
      .V()
      .has('label', domain.vertex.componentInstance.constants.LABEL)
      .has('instanceId', instanceId)
      .id()

    const [stateMachineId] = await g
      .V(instanceVertexId)
      .out(domain.edge.has_stateMachine.componentInstance_stateMachine.constants.LABEL)
      .id()

    const [taskStateEdgeId] = await g
      .V(stateMachineId)
      .outE(domain.edge.has_task_state.stateMachine_task.constants.LABEL)
      .id()

    const result = await taskNodes({
      rootCtx: { g },
      scope: { instanceId, stateId: taskStateEdgeId },
    })

    assert.equal(result.stateMachineId, stateMachineId)
    assert.equal(result.instanceVertexId, instanceVertexId)
    assert.equal(pickFirst(result.componentHash), component.hash)
    assert.equal(pickFirst(result.name), 'taskA')

    const [taskRow] = await g.V(result.taskNodeId).valueMap('name')
    assert.equal(pickFirst(taskRow.name), 'taskA')
  })
})
