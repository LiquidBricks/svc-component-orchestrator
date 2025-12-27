import { create as createBasicSubject } from '@liquid-bricks/shared-providers/subject/create/basic'

export async function publishStartCommands({ rootCtx: { natsContext }, scope: {
  starters } }) {

  for (const { dataStateIds, taskStateIds, serviceStateIds, instanceId } of starters) {

    const publishList = [
      { stateIds: dataStateIds, entity: 'data', action: 'start' },
      { stateIds: taskStateIds, entity: 'task', action: 'start' },
      { stateIds: serviceStateIds, entity: 'service', action: 'start' },
    ]

    for (const { stateIds, entity, action } of publishList) {
      if (!stateIds.length) continue
      const startSubject = createBasicSubject()
        .env('prod')
        .ns('component-service')
        .entity(entity)
        .channel('cmd')
        .action(action)
        .version('v1')

      for (const stateId of stateIds) {
        await natsContext.publish(
          startSubject.build(),
          JSON.stringify({ data: { instanceId, stateId } })
        )
      }
    }
  }
}
