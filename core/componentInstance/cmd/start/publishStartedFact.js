import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { domain } from '@liquid-bricks/spec-domain/domain'
import { Errors } from '../../../../errors.js'

function ids(entries = []) {
  return Array.from(new Set(
    entries
      .map((entry) => (typeof entry === 'string' ? entry : entry?.instanceId))
      .filter(Boolean)
      .map(String),
  ))
}

export async function publishStartedFact({
  scope: {
    instanceId,
    instanceVertexId,
    stateMachineId,
    dataStateIds = [],
    taskStateIds = [],
    usesImportInstances = [],
    usesGateInstances = [],
    handlerDiagnostics,
  },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  const payload = {
    instanceId,
    instanceVertexId,
    stateMachineId,
    state: domain.vertex.stateMachine.constants.STATES.RUNNING,
    dataStateIds: Array.from(new Set(dataStateIds.filter(Boolean).map(String))),
    taskStateIds: Array.from(new Set(taskStateIds.filter(Boolean).map(String))),
    importInstanceIds: ids(usesImportInstances),
    gateInstanceIds: ids(usesGateInstances),
    updatedAt: new Date().toISOString(),
  }

  for (const field of ['instanceId', 'instanceVertexId', 'stateMachineId', 'state', 'updatedAt']) {
    handlerDiagnostics.require(
      typeof payload[field] === 'string' && payload[field].length > 0,
      Errors.PRECONDITION_REQUIRED,
      `${field} required before publishing stateMachine started`,
      { field },
    )
  }
  for (const field of ['dataStateIds', 'taskStateIds', 'importInstanceIds', 'gateInstanceIds']) {
    handlerDiagnostics.require(
      payload[field].every((id) => typeof id === 'string' && id.length > 0),
      Errors.PRECONDITION_INVALID,
      `${field} must contain string ids before publishing stateMachine started`,
      { field },
    )
  }

  await natsContext.publish(
    createSubject(emits['domain.vertex.stateMachine.started.v1']).forPublish().env('prod').build(),
    JSON.stringify({ data: payload }),
  )

  return payload
}
