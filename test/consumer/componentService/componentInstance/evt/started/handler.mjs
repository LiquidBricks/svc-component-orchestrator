import test from 'node:test'
import assert from 'node:assert/strict'

import { handler } from '../../../../../../componentInstance/evt/started/handler.js'

test('handler resolves without side effects', async () => {
  await assert.doesNotReject(async () =>
    handler({ scope: { handlerDiagnostics: {}, instanceId: 'instance-1' } })
  )
})
