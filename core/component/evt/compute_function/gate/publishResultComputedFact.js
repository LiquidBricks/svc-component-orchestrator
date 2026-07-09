import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

export async function publishResultComputedFact({
  scope: {
    instanceId,
    instanceVertexId,
    stateMachineId,
    name,
    result,
  },
  rootCtx: { dataMapper, natsContext },
}) {
  if (!instanceVertexId || !name) return { instanceId }

  const [gateInstanceRefId] = await dataMapper.query.findGateInstanceRefIdByAlias({ vertexId: instanceVertexId, alias: name })
  if (!gateInstanceRefId) return { instanceId }

  const updatedAt = new Date().toISOString()
  const resultValue = result != null ? JSON.stringify(result) : ''

  await natsContext.publish(
    createSubject(natsEvents['*'].domain['*']['*'].edge.uses_gate.result_computed.v1['*'])
      .forPublish()
      .env('prod')
      .build(),
    JSON.stringify({
      data: {
        instanceId,
        instanceVertexId,
        stateMachineId,
        gateInstanceRefId,
        type: 'gate',
        name,
        result,
        resultValue,
        updatedAt,
      },
    }),
  )

  return { instanceId, gateInstanceRefId, updatedAt }
}
