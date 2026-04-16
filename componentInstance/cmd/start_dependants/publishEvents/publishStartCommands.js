import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function publishStartCommands({ rootCtx: { natsContext }, scope: {
  starters } }) {

  for (const { dataStateIds, taskStateIds, importInstanceIds = [], gateStartRequests = [], instanceId } of starters) {

    const publishList = [
      { stateIds: dataStateIds, entity: 'data', action: 'start' },
      { stateIds: taskStateIds, entity: 'task', action: 'start' },
    ]

    for (const { stateIds, entity, action } of publishList) {
      if (!stateIds?.length) continue
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

    const importSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('import')
      .channel('cmd')
      .action('start')
      .version('v1')

    const childInstanceIds = [...new Set(importInstanceIds ?? [])]
    for (const childInstanceId of childInstanceIds) {
      if (!childInstanceId) continue
      await natsContext.publish(
        importSubject.build(),
        JSON.stringify({ data: { instanceId: childInstanceId, parentInstanceId: instanceId } })
      )
    }

    const gateSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('component')
      .channel('exec')
      .action('compute_result')
      .version('v1')

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
