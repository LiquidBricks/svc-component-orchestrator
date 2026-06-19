import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { domain } from '@liquid-bricks/spec-domain/domain'
import { hasInstanceStarted } from '../../../../componentInstance/cmd/dependencyUtils.js'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


function pickFirst(values) {
  return Array.isArray(values) ? values[0] : values
}

export async function publishGateStartIfPassed({
  scope: { type, result, name, instanceVertexId },
  rootCtx: { g, natsContext },
}) {
  if (type !== 'gate' || result !== true) return
  if (!name || !instanceVertexId) return

  const [gateInstanceVertexId] = await g
    .V(instanceVertexId)
    .out(domain.edge.uses_gate.componentInstance_gateInstanceRef.constants.LABEL)
    .filter(_ => _.out(domain.edge.uses_gate.gateInstanceRef_gateRef.constants.LABEL).has('alias', name))
    .out(domain.edge.uses_gate.gateInstanceRef_componentInstance.constants.LABEL)
    .id()
  if (!gateInstanceVertexId) return

  const alreadyRunning = await hasInstanceStarted({ g, instanceVertexId: gateInstanceVertexId })
  if (alreadyRunning) return

  const [instanceValues] = await g.V(gateInstanceVertexId).valueMap('instanceId')
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

