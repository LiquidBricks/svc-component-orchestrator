import { ackMessage, decodeData } from '../../../../../middleware/index.js'
import { completeStateMachineIfFinished } from './completeStateMachineIfFinished.js'
import { publishInjectResultsCommand } from './publishInjectResultsCommand.js'
import { publishStartDependantsCommand } from './publishStartDependantsCommand.js'
import { validatePayload } from './validatePayload.js'
import { path } from './subject.js'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

function handler() {}

export { path }

export const emits = {
  'component_service.evt.componentInstance.state_machine_completed.v1':
    natsEvents['*'].component_service['*']['*'].evt.componentInstance.state_machine_completed.v1['*'],
  'component_service.cmd.componentInstance.injectResults.v1':
    natsEvents['*'].component_service['*']['*'].cmd.componentInstance.injectResults.v1['*'],
  'component_service.cmd.componentInstance.start_dependants.v1':
    natsEvents['*'].component_service['*']['*'].cmd.componentInstance.start_dependants.v1['*'],
}

export const spec = {
  context: { emits },
  decode: [
    decodeData([
      'instanceId',
      'instanceVertexId',
      'stateMachineId',
      'stateEdgeId',
      'stateId',
      'type',
      'name',
      'result',
      'resultValue',
      'status',
      'stateEdgeStatus',
      'updatedAt',
    ]),
  ],
  pre: [
    validatePayload,
  ],
  handler,
  post: [
    {
      completeStateMachineIfFinished,
      publishInjectResultsCommand,
      publishStartDependantsCommand,
    },
    ackMessage,
  ],
}
