import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export function createPublishComputationFailedFact({ type, emitKey }) {
  return async function publishComputationFailedFact({
    scope: {
      instanceId,
      instanceVertexId,
      stateMachineId,
      stateEdgeId,
      gateInstanceRefId,
      name,
      error,
    },
    rootCtx: { natsContext },
    routeCtx: { emits },
  }) {
    const updatedAt = new Date().toISOString()

    await natsContext.publish(
      createSubject(emits[emitKey])
        .forPublish()
        .env('prod')
        .build(),
      JSON.stringify({
        data: {
          instanceId,
          instanceVertexId,
          stateMachineId,
          stateEdgeId,
          stateId: stateEdgeId,
          ...(type === 'gate' ? { gateInstanceRefId } : {}),
          type,
          name,
          status: 'error',
          stateEdgeStatus: 'error',
          error,
          updatedAt,
        },
      }),
    )

    return {
      instanceId,
      stateEdgeId,
      ...(type === 'gate' ? { gateInstanceRefId } : {}),
      status: 'error',
      stateEdgeStatus: 'error',
      error,
      updatedAt,
    }
  }
}
