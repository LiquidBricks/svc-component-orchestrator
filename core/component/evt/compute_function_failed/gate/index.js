import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'
import { ackMessage, decodeData } from '../../../../../middleware/index.js'
import { findStateEdge } from '../../compute_function/gate/findStateEdge.js'
import { loadData } from '../../compute_function/_helper/loadData.js'
import { createPublishComputationFailedFact } from '../_helper/publishComputationFailedFact.js'
import { validatePayload } from '../_helper/validatePayload.js'

const emitKey = 'domain.edge.has_gate_state.computation_failed.v1'

export const path = createSubject(natsEvents['*'].component_service['*'].function_result.evt.component.compute_function_failed.v1.gate)
  .forSubscribe()
  .toObject()

export const emits = {
  [emitKey]: natsEvents['*'].domain['*']['*'].edge.has_gate_state.computation_failed.v1['*'],
}

export const spec = {
  context: { emits },
  decode: [
    decodeData(['instanceId', 'name', 'status', 'stateEdgeStatus', 'error', 'result', 'resultValue']),
  ],
  pre: [
    validatePayload,
    loadData,
    findStateEdge,
  ],
  handler: createPublishComputationFailedFact({ type: 'gate', emitKey }),
  post: [
    ackMessage,
  ],
}
