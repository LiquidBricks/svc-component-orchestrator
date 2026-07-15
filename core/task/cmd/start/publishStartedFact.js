import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { domain } from '@liquid-bricks/spec-domain/domain'
import { Errors } from '../../../../errors.js'

function first(value) {
  return Array.isArray(value) ? value[0] : value
}

function statusFrom(value) {
  const row = first(value)
  return first(row?.status ?? row)
}

export async function publishStartedFact({
  scope: {
    instanceId,
    stateId,
    instanceVertexId,
    stateMachineId,
    taskNodeId,
    componentHash,
    name,
    deps = {},
    handlerDiagnostics,
  },
  rootCtx: { dataMapper, natsContext },
  routeCtx: { emits },
}) {
  try {
    const current = await dataMapper.query.readTaskStateStatus({ stateId })
    if (statusFrom(current) === domain.edge.has_task_state.stateMachine_task.constants.Status.PROVIDED) {
      return { lifecycleStartSkipped: true }
    }
  } catch {
    // The projector remains authoritative; a best-effort read must not lose start intent.
  }

  const updatedAt = new Date().toISOString()
  const status = domain.edge.has_task_state.stateMachine_task.constants.Status.RUNNING
  const payload = {
    instanceId,
    instanceVertexId,
    stateMachineId,
    stateEdgeId: stateId,
    stateId,
    nodeId: taskNodeId,
    componentHash: first(componentHash),
    name: first(name),
    deps,
    type: 'task',
    status,
    stateEdgeStatus: status,
    updatedAt,
  }

  for (const field of [
    'instanceId',
    'instanceVertexId',
    'stateMachineId',
    'stateEdgeId',
    'stateId',
    'nodeId',
    'componentHash',
    'name',
    'status',
    'stateEdgeStatus',
    'updatedAt',
  ]) {
    handlerDiagnostics.require(
      typeof payload[field] === 'string' && payload[field].length > 0,
      Errors.PRECONDITION_REQUIRED,
      `${field} required before publishing task started`,
      { field },
    )
  }
  handlerDiagnostics.require(
    payload.deps && typeof payload.deps === 'object' && !Array.isArray(payload.deps),
    Errors.PRECONDITION_INVALID,
    'deps must be an object before publishing task started',
    { field: 'deps' },
  )

  await natsContext.publish(
    createSubject(emits['domain.edge.has_task_state.started.v1']).forPublish().env('prod').build(),
    JSON.stringify({ data: payload }),
  )

  return payload
}
