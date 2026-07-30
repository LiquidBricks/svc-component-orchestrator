import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { PRECONDITION_INVALID, PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes'

function isInitialState(value) {
  return value != null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.values(value).every(entry => entry === null)
}

export async function publishCreatedFacts({
  scope: {
    createdInstances,
    handlerDiagnostics,
  },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  handlerDiagnostics.require(
    Array.isArray(createdInstances) && createdInstances.length > 0,
    PRECONDITION_REQUIRED,
    'createdInstances required before publishing componentInstance created',
    { field: 'createdInstances' },
  )

  const subject = createSubject(emits['domain.vertex.componentInstance.created.v1'])
    .forPublish()
    .env('prod')
    .build()
  const updatedAt = new Date().toISOString()
  const facts = []

  for (const createdInstance of createdInstances) {
    const fact = {
      instanceId: createdInstance.instanceId,
      instanceVertexId: createdInstance.instanceVertexId,
      componentId: createdInstance.componentId,
      componentHash: createdInstance.componentHash,
      stateMachineId: createdInstance.stateMachineId,
      state: createdInstance.state,
      updatedAt,
    }

    for (const field of [
      'instanceId',
      'instanceVertexId',
      'componentId',
      'componentHash',
      'stateMachineId',
      'updatedAt',
    ]) {
      handlerDiagnostics.require(
        typeof fact[field] === 'string' && fact[field].length > 0,
        PRECONDITION_REQUIRED,
        `${field} required before publishing componentInstance created`,
        { field },
      )
    }
    handlerDiagnostics.require(
      isInitialState(fact.state),
      PRECONDITION_INVALID,
      'state must be an object containing only null initial values before publishing componentInstance created',
      { field: 'state' },
    )

    await natsContext.publish(
      subject,
      JSON.stringify({ data: fact }),
    )
    facts.push(fact)
  }

  return { createdFacts: facts }
}
