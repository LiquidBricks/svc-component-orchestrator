import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { hasInstanceStarted } from '../../../../componentInstance/cmd/dependencyUtils.js'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


function pickFirst(values) {
  return Array.isArray(values) ? values[0] : values
}

export async function publishStartIfPassed({
  scope: { result, name, instanceVertexId },
  rootCtx: { g, dataMapper, natsContext },
}) {
  if (result !== true) return
  if (!name || !instanceVertexId) return

  const [gateInstanceVertexId] = await dataMapper.query.findGateInstanceVertexIdByAlias({ vertexId: instanceVertexId, alias: name })
  if (!gateInstanceVertexId) return

  const alreadyRunning = await hasInstanceStarted({ g, dataMapper, instanceVertexId: gateInstanceVertexId })
  if (alreadyRunning) return

  const [instanceValues] = await dataMapper.query.readGateInstanceId({ vertexId: gateInstanceVertexId })
  const gateInstanceId = pickFirst(instanceValues?.instanceId ?? instanceValues)
  if (!gateInstanceId) return

  const subject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.start.v1['*']).forPublish()
    .env('prod')
    .build()

  await natsContext.publish(
    subject,
    JSON.stringify({ data: { instanceId: gateInstanceId } }),
  )
}
