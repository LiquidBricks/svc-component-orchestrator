import { ackMessage, decodeData } from '../../../../middleware/index.js'
import { findDependencyFreeStates } from './findDependencyFreeStates.js'
import { getStateMachine } from './getStateMachine.js'
import { handler } from './handler.js'
import { publishEvents } from './publishEvents/index.js'
import { doesInstanceExist } from './doesInstanceExist.js'
import { loadData } from './loadData/index.js'

export const path = { channel: 'cmd', entity: 'componentInstance', action: 'start' }

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
