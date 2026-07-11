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

export const emits = {
  'component_service.cmd.data.start.v1':
    natsEvents['*'].component_service['*']['*'].cmd.data.start.v1['*'],
  'component_service.cmd.task.start.v1':
    natsEvents['*'].component_service['*']['*'].cmd.task.start.v1['*'],
  'component_service.cmd.import.start.v1':
    natsEvents['*'].component_service['*']['*'].cmd.import.start.v1['*'],
  'component_service.cmd.gate.start.v1':
    natsEvents['*'].component_service['*']['*'].cmd.gate.start.v1['*'],
  'component_service.evt.componentInstance.startDone.v1':
    natsEvents['*'].component_service['*']['*'].evt.componentInstance.startDone.v1['*'],
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
  ],
  handler,
  post: [
    ackMessage,
    publishEvents,
  ]
}
