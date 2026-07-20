import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

function computeFunctionSubjectForTargetType(emits, targetType) {
  const subject = targetType === 'data'
    ? emits['component_service.function_result.evt.component.compute_function.v1.data']
    : emits['component_service.function_result.evt.component.compute_function.v1.task']

  return createBasicSubject(subject)
    .forPublish()
    .env('prod')
    .build()
}

export async function publishInjectedComputeResultDoneEvents({
  scope,
  rootCtx: { dataMapper, natsContext },
  routeCtx: { emits },
}) {
  const {
    instanceId,
    instanceVertexId,
    stateMachineId,
    stateEdgeId,
    type,
    result,
  } = scope

  const routing = await dataMapper.vertex.componentInstance.index.injectionRouting.lookup({
    instanceId,
    instanceVertexId,
    stateMachineId,
    stateEdgeId,
    type,
  })

  for (const target of routing.targets) {
    await natsContext.publish(
      computeFunctionSubjectForTargetType(emits, target.type),
      JSON.stringify({
        data: {
          instanceId: target.instanceId,
          stateId: target.stateEdgeId,
          name: target.name,
          type: target.type,
          result,
        },
      }),
    )
  }
}
