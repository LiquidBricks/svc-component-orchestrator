import { ackMessage, decodeData } from '../../../../middleware/index.js'
import { findDependencyFreeStates } from './findDependencyFreeStates.js'
import { getStateMachine } from './getStateMachine.js'
import { handler } from './handler.js'
import { publishEvents } from './publishEvents/index.js'
import { doesInstanceExist } from './doesInstanceExist.js'
import { loadData } from './loadData/index.js'
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

export const path = createSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.start.v1['*'])
  .forSubscribe()
  .toObject()

export const spec = {
  decode: [
    decodeData(['instanceId']),
  ],
  pre: [
    doesInstanceExist,
    ...loadData,
    getStateMachine,
    findDependencyFreeStates,
  ],
  handler,
  post: [
    ackMessage,
    publishEvents,
  ]
}
