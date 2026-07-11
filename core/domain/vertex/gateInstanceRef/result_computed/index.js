import { ackMessage, decodeData } from '../../../../../middleware/index.js'
import { completeStateMachineIfFinished } from './completeStateMachineIfFinished.js'
import { publishStartIfPassed } from './publishStartIfPassed.js'
import { validatePayload } from './validatePayload.js'
import { path } from './subject.js'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

function handler() {}

export { path }

export const emits = {
  'component_service.evt.componentInstance.state_machine_completed.v1':
    natsEvents['*'].component_service['*']['*'].evt.componentInstance.state_machine_completed.v1['*'],
  'component_service.cmd.componentInstance.start.v1':
    natsEvents['*'].component_service['*']['*'].cmd.componentInstance.start.v1['*'],
}

export const spec = {
  context: { emits },
  decode: [
    decodeData([
      'instanceId',
      'instanceVertexId',
      'stateMachineId',
      'gateInstanceRefId',
      'type',
      'name',
      'result',
      'resultValue',
      'updatedAt',
    ]),
  ],
  pre: [
    validatePayload,
  ],
  handler,
  post: [
    {
      publishStartIfPassed,
      completeStateMachineIfFinished,
    },
    ackMessage,
  ],
}
