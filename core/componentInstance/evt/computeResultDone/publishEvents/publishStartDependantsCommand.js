import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { domain } from '@liquid-bricks/spec-domain/domain'
import { hasInstanceStarted } from '../../../cmd/dependencyUtils.js'

export async function publishStartDependantsCommand({
  scope: { instanceId, instanceVertexId, stateEdgeId, type },
  rootCtx: { natsContext, g },
}) {
  if (g && instanceVertexId) {
    const [gateInstanceRefId] = await g
      .V(instanceVertexId)
      .in(domain.edge.uses_gate.gateInstanceRef_componentInstance.constants.LABEL)
      .id()

    if (gateInstanceRefId) {
      const isStarted = await hasInstanceStarted({ g, instanceVertexId })
      if (!isStarted) return
    }
  }

  const subject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('componentInstance')
    .channel('cmd')
    .action('start_dependants')
    .version('v1')

  await natsContext.publish(
    subject.build(),
    JSON.stringify({ data: { instanceId, stateEdgeId, type } })
  )
}
