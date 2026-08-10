import { ackMessage, decodeData } from '../../../../middleware/index.js'
import { findDependencyFreeStates } from './findDependencyFreeStates.js'
import { findProvidedStates } from './findProvidedStates.js'
import { getStateMachine } from './getStateMachine.js'
import { publishStartedFact } from './publishStartedFact.js'
import { doesInstanceExist } from './doesInstanceExist.js'
import { loadData } from './loadData/index.js'
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

export const path = createSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.start.v1['*'])
  .forSubscribe()
  .toObject()

export const emits = {
  'domain.vertex.stateMachine.started.v1':
    natsEvents['*'].domain['*']['*'].vertex.stateMachine.started.v1['*'],
}

export const spec = {
  context: { emits },
  decode: [
    decodeData(['instanceId']),
  ],
  pre: [
    doesInstanceExist,
    ...loadData,
    getStateMachine,
    findDependencyFreeStates,
    findProvidedStates,
  ],
  handler: publishStartedFact,
  post: [
    ackMessage,
  ]
}
