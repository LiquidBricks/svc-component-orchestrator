import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'
import { ackMessage, decodeData } from '../../../../../middleware/index.js'
import { findStateEdge } from './findStateEdge.js'
import { loadData } from '../_helper/loadData.js'
import { publishResultComputedFact } from './publishResultComputedFact.js'
import { validatePayload } from '../_helper/validatePayload.js'

export const path = createSubject(natsEvents['*'].component_service['*'].function_result.evt.component.compute_function.v1.data)
  .forSubscribe()
  .toObject()

export const emits = {
  'domain.edge.has_data_state.result_computed.v1':
    natsEvents['*'].domain['*']['*'].edge.has_data_state.result_computed.v1['*'],
}

export const spec = {
  context: { emits },
  decode: [
    decodeData(['instanceId', 'name', 'result', 'status', 'stateEdgeStatus', 'error']),
  ],
  pre: [
    validatePayload,
    loadData,
    findStateEdge,
  ],
  handler: publishResultComputedFact,
  post: [
    ackMessage,
  ]
}

export { getCodeLocation } from '../_helper/getCodeLocation.js'
