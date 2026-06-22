import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { domain } from '@liquid-bricks/spec-domain/domain'
import { hasInstanceStarted } from '../../../../componentInstance/cmd/dependencyUtils.js'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


export async function publishStartDependantsCommand({
  scope: { instanceId, instanceVertexId, stateEdgeId },
  rootCtx: { natsContext, g, dataMapper },
}) {
  if (g && instanceVertexId) {
    const [gateInstanceRefId] = await dataMapper.query.findOwningGateInstanceRefId({ vertexId: instanceVertexId })

    if (gateInstanceRefId) {
      const isStarted = await hasInstanceStarted({ g, dataMapper, instanceVertexId })
      if (!isStarted) return
    }
  }

  const subject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.start_dependants.v1['*']).forPublish()
    .env('prod')

  await natsContext.publish(
    subject.build(),
    JSON.stringify({ data: { instanceId, stateEdgeId, type: 'data' } })
  )
}
