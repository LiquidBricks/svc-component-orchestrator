import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { domain } from '@liquid-bricks/spec-domain/domain'
import { PRECONDITION_INVALID, PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes'

function ids(entries = []) {
  return Array.from(new Set(
    entries
      .map((entry) => (typeof entry === 'string' ? entry : entry?.instanceId))
      .filter(Boolean)
      .map(String),
  ))
}

function providedStateEntries(entries = []) {
  const normalized = entries.map((entry) => ({
    stateEdgeId: entry?.stateEdgeId,
    type: entry?.type,
  }))

  return Array.from(new Map(
    normalized.map((entry) => [`${entry.type}:${entry.stateEdgeId}`, entry]),
  ).values())
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
    providedStates = [],
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
    providedStates: providedStateEntries(providedStates),
    updatedAt: new Date().toISOString(),
  }

  for (const field of ['instanceId', 'instanceVertexId', 'stateMachineId', 'state', 'updatedAt']) {
    handlerDiagnostics.require(
      typeof payload[field] === 'string' && payload[field].length > 0,
      PRECONDITION_REQUIRED,
      `${field} required before publishing stateMachine started`,
      { field },
    )
  }
  for (const field of ['dataStateIds', 'taskStateIds', 'importInstanceIds', 'gateInstanceIds']) {
    handlerDiagnostics.require(
      payload[field].every((id) => typeof id === 'string' && id.length > 0),
      PRECONDITION_INVALID,
      `${field} must contain string ids before publishing stateMachine started`,
      { field },
    )
  }

  handlerDiagnostics.require(
    payload.providedStates.every(({ stateEdgeId, type }) =>
      typeof stateEdgeId === 'string'
      && stateEdgeId.length > 0
      && ['data', 'task'].includes(type)
    ),
    PRECONDITION_INVALID,
    'providedStates must contain data or task state edge ids before publishing stateMachine started',
    { field: 'providedStates' },
  )

  await natsContext.publish(
    createSubject(emits['domain.vertex.stateMachine.started.v1']).forPublish().env('prod').build(),
    JSON.stringify({ data: payload }),
  )

  return payload
}
