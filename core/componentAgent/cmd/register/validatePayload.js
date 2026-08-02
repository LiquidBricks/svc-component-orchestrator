import { PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes'

export function validatePayload({ scope: { agentID }, rootCtx: { diagnostics } }) {
  diagnostics.require(
    typeof agentID === 'string' && agentID.length,
    PRECONDITION_REQUIRED,
    'agentID is required',
    { field: 'agentID' },
  )
}
