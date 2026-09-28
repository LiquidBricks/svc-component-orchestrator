import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { hasInstanceStarted } from '../../../../componentInstance/cmd/dependencyUtils.js'
import { instantiateRoute } from '../../../../gate/instantiateRoute.js'

function pickFirst(values) {
  return Array.isArray(values) ? values[0] : values
}

export async function publishStartIfPassed(args) {
  const {
    scope: { result, name, instanceVertexId },
    rootCtx: { g, dataMapper, natsContext },
    routeCtx: { emits },
  } = args
  if (result !== true) return
  if (!name || !instanceVertexId) return

  let [gateInstanceVertexId] = await dataMapper.query.findGateInstanceVertexIdByAlias({ vertexId: instanceVertexId, alias: name })
  if (!gateInstanceVertexId) {
    const [gateInstanceRefId] = await dataMapper.query.findGateInstanceRefIdByAlias({ vertexId: instanceVertexId, alias: name })
    if (!gateInstanceRefId) return
    const [gateRefId] = await dataMapper.query.findGateRefIdForInstanceRef({ vertexId: gateInstanceRefId })
    const [definition] = await dataMapper.query.readGateRefAliasAndFunction({ vertexId: gateRefId })
    if (definition?.router !== undefined) {
      gateInstanceVertexId = await instantiateRoute({ ...args, gateInstanceRefId, gateRefId })
    }
  }
  if (!gateInstanceVertexId) return

  const alreadyRunning = await hasInstanceStarted({ g, dataMapper, instanceVertexId: gateInstanceVertexId })
  if (alreadyRunning) return

  const [instanceValues] = await dataMapper.query.readGateInstanceId({ vertexId: gateInstanceVertexId })
  const gateInstanceId = pickFirst(instanceValues?.instanceId ?? instanceValues)
  if (!gateInstanceId) return

  const subject = createBasicSubject(emits['component_service.cmd.componentInstance.start.v1']).forPublish()
    .env('prod')
    .build()

  await natsContext.publish(
    subject,
    JSON.stringify({ data: { instanceId: gateInstanceId } }),
  )
}
