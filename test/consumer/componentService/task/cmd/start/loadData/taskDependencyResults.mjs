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

    const [componentId] = await g
      .V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', component.hash)
      .id()

    const { imports } = await componentImports({ rootCtx: { g }, scope: { componentId } })

    const instanceId = 'instance-task-deps'
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

    const [taskNodeId] = await g.E(taskStateEdgeId).inV().id()

    const { deps } = await taskDependencyResults({
      rootCtx: { g },
      scope: { instanceVertexId, taskNodeId },
    })

    assert.deepEqual(deps, {})

    const [taskRow] = await g.V(taskNodeId).valueMap('name')
    assert.equal(pickFirst(taskRow.name), 'taskRoot')
  })
})
