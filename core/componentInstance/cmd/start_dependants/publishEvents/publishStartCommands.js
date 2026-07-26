import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function publishStartCommands({
  rootCtx: { natsContext },
  routeCtx: { emits },
  scope: { starters },
}) {

  for (const { dataStateIds, taskStateIds, importInstanceIds = [], gateInstanceIds = [], instanceId } of starters) {

    const publishList = [
      {
        stateIds: dataStateIds,
        startSubject: createBasicSubject(emits['component_service.cmd.data.start.v1']).forPublish()
          .env('prod'),
      },
      {
        stateIds: taskStateIds,
        startSubject: createBasicSubject(emits['component_service.cmd.task.start.v1']).forPublish()
          .env('prod'),
      },
    ]

    for (const { stateIds, startSubject } of publishList) {
      if (!stateIds?.length) continue

      for (const stateId of stateIds) {
        await natsContext.publish(
          startSubject.build(),
          JSON.stringify({ data: { instanceId, stateId } })
        )
      }
    }

    const importSubject = createBasicSubject(emits['component_service.cmd.import.start.v1']).forPublish()
      .env('prod')

    const childInstanceIds = [...new Set(importInstanceIds ?? [])]
    for (const childInstanceId of childInstanceIds) {
      if (!childInstanceId) continue
      await natsContext.publish(
        importSubject.build(),
        JSON.stringify({ data: { instanceId: childInstanceId, parentInstanceId: instanceId } })
      )
    }

    const gateSubject = createBasicSubject(emits['component_service.cmd.gate.start.v1']).forPublish()
      .env('prod')

    const childGateInstanceIds = [...new Set(gateInstanceIds ?? [])]
    for (const gateInstanceId of childGateInstanceIds) {
      if (!gateInstanceId || !instanceId) continue

      await natsContext.publish(
        gateSubject.build(),
        JSON.stringify({
          data: {
            instanceId: gateInstanceId,
            parentInstanceId: instanceId,
          },
        }),
      )
    }
  }
}
