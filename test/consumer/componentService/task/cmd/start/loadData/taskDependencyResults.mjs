import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { taskDependencyResults } from '../../../../../../../core/task/cmd/start/loadData/taskDependencyResults.js'
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

test('taskDependencyResults returns empty deps when task has no dependencies', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('TaskDepsComponent')
      .task('taskRoot', {})
      .toJSON()

    await registerComponent({ diagnostics, dataMapper, g }, component)

    const [componentId] = await dataMapper.query.findComponentIdByHash({ hash: component.hash })

    const { imports } = await componentImports({ rootCtx: { g, dataMapper }, scope: { componentId } })

    const instanceId = 'instance-task-deps'
    await createInstance({ diagnostics, dataMapper, g }, {
      componentHash: component.hash,
      componentId,
      instanceId,
      imports,
    })

    const [instanceVertexId] = await dataMapper.query.findInstanceVertexId({ instanceId })

    const [stateMachineId] = await dataMapper.query.readStateMachineId({ vertexId: instanceVertexId })

    const [taskStateEdgeId] = await dataMapper.query.readTaskStateEdgeId({ vertexId: stateMachineId })

    const [taskNodeId] = await dataMapper.query.findTaskNodeId({ edgeId: taskStateEdgeId })

    const { deps } = await taskDependencyResults({
      rootCtx: { g, dataMapper },
      scope: { instanceVertexId, taskNodeId },
    })

    assert.deepEqual(deps, {})

    const [taskRow] = await dataMapper.query.readTaskRow({ vertexId: taskNodeId })
    assert.equal(pickFirst(taskRow.name), 'taskRoot')
  })
})
