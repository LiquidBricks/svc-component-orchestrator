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

    const [componentId] = await dataMapper.query.findComponentIdByHash({ hash: component.hash })

    const { imports } = await componentImports({ rootCtx: { g, dataMapper }, scope: { componentId } })

    const instanceId = 'instance-task-nodes'
    await createInstance({ diagnostics, dataMapper, g }, {
      componentHash: component.hash,
      componentId,
      instanceId,
      imports,
    })

    const [instanceVertexId] = await dataMapper.query.findInstanceVertexId({ instanceId })

    const [stateMachineId] = await dataMapper.query.readStateMachineId({ vertexId: instanceVertexId })

    const [taskStateEdgeId] = await dataMapper.query.readTaskStateEdgeId({ vertexId: stateMachineId })

    const result = await taskNodes({
      rootCtx: { g, dataMapper },
      scope: { instanceId, stateId: taskStateEdgeId },
    })

    assert.equal(result.stateMachineId, stateMachineId)
    assert.equal(result.instanceVertexId, instanceVertexId)
    assert.equal(pickFirst(result.componentHash), component.hash)
    assert.equal(pickFirst(result.name), 'taskA')

    const [taskRow] = await dataMapper.query.readTaskRow({ vertexId: result.taskNodeId })
    assert.equal(pickFirst(taskRow.name), 'taskA')
  })
})
