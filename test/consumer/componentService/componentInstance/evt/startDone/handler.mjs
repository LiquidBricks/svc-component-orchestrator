import test from 'node:test'
import assert from 'node:assert/strict'

import { handler } from '../../../../../../core/componentInstance/evt/startDone/handler.js'

test('handler resolves without side effects', async () => {
  await assert.doesNotReject(async () =>
    handler({ scope: { handlerDiagnostics: {}, instanceId: 'instance-1' } })
  )
})
