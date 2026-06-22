import { ackMessage, decodeData } from '../../../../middleware/index.js'
import { Errors } from '../../../../errors.js'
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

export const path = createSubject(natsEvents['*'].component_service['*']['*'].cmd.componentAgent.register.v1['*'])
  .forSubscribe()
  .toObject()

export const spec = {
  decode: [
    decodeData(['agentID']),
  ],
  pre: [
    validatePayload,
  ],
  handler: registerComponentAgent,
  post: [
    ackMessage,
  ],
}

function validatePayload({ scope: { agentID }, rootCtx: { diagnostics } }) {
  diagnostics.require(
    typeof agentID === 'string' && agentID.length,
    Errors.PRECONDITION_REQUIRED,
    'agentID is required',
    { field: 'agentID' },
  )
}

async function registerComponentAgent({ scope: { agentID }, rootCtx: { g, dataMapper } }) {

  const [existingComponentAgentVID] = await dataMapper.query.findComponentAgentVertexId({ agentID })

  if (existingComponentAgentVID) {
    return { componentAgentVID: existingComponentAgentVID, componentAgentAlreadyRegistered: true }
  }

  const { id: componentAgentVID } = await dataMapper.vertex.componentAgent.create({ agentID })
  return { componentAgentVID, componentAgentAlreadyRegistered: false }
}
