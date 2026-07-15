import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'
import { ackMessage, decodeData } from '../../../../../middleware/index.js'
import { publishEvents } from './publishEvents/index.js'
import { path } from './subject.js'
import { validatePayload } from './validatePayload.js'

function handler() {}

export { path }

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
    decodeData([
      'instanceId',
      'instanceVertexId',
      'stateMachineId',
      'state',
      'dataStateIds',
      'taskStateIds',
      'importInstanceIds',
      'gateInstanceIds',
      'updatedAt',
    ]),
  ],
  pre: [validatePayload],
  handler,
  post: [publishEvents, ackMessage],
}
