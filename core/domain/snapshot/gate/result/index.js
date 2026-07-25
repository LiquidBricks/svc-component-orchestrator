import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'
import { ackMessage, decodeData } from '../../../../../middleware/index.js'
import { publishCheckStateMachineCompletionCommand } from '../../_shared/publishCheckStateMachineCompletionCommand.js'
import { path } from './subject.js'
import { validatePayload } from './validatePayload.js'

export { path }

export const emits = {
  'component_service.cmd.componentInstance.check_state_machine_completion.v1':
    natsEvents['*'].component_service['*']['*'].cmd.componentInstance.check_state_machine_completion.v1['*'],
}

export const spec = {
  context: { emits },
  decode: [
    decodeData([
      'instanceId',
      'instanceVertexId',
      'componentStateId',
      'stateMachineId',
      'stateEdgeId',
      'gateInstanceRefId',
      'type',
      'name',
      'delta',
      'updatedAt',
    ]),
  ],
  pre: [
    validatePayload,
  ],
  handler: publishCheckStateMachineCompletionCommand,
  post: [
    ackMessage,
  ],
}
