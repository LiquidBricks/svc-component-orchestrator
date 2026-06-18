import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


export async function publishStartCommands({ rootCtx: { natsContext }, scope: {
  starters } }) {

  for (const { dataStateIds, taskStateIds, importInstanceIds = [], gateStartRequests = [], instanceId } of starters) {

    const publishList = [
      {
        stateIds: dataStateIds,
        startSubject: createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.data.start.v1['*']).forPublish()
          .env('prod'),
      },
      {
        stateIds: taskStateIds,
        startSubject: createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.task.start.v1['*']).forPublish()
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

    const importSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.import.start.v1['*']).forPublish()
      .env('prod')

    const childInstanceIds = [...new Set(importInstanceIds ?? [])]
    for (const childInstanceId of childInstanceIds) {
      if (!childInstanceId) continue
      await natsContext.publish(
        importSubject.build(),
        JSON.stringify({ data: { instanceId: childInstanceId, parentInstanceId: instanceId } })
      )
    }

    const gateSubject = createBasicSubject(natsEvents['*'].gateway['*']['*'].cmd.component.compute_function.v1['*']).forPublish()
      .env('prod')

    const normalizedGates = (gateStartRequests ?? [])
      .filter(Boolean)
    const dispatched = new Set()
    for (const gateRequest of normalizedGates) {
      const {
        instanceId: gateInstanceId,
        componentHash,
        name,
        type = 'gate',
        deps = {},
      } = gateRequest
      if (!gateInstanceId || !componentHash || !name) continue
      const dispatchKey = `${gateInstanceId}:${name}`
      if (dispatched.has(dispatchKey)) continue
      dispatched.add(dispatchKey)

      await natsContext.publish(
        gateSubject.build(),
        JSON.stringify({
          data: {
            instanceId: gateInstanceId,
            componentHash,
            name,
            type,
            deps,
          },
        }),
      )
    }
  }
}
