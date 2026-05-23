import test from 'node:test'
import assert from 'node:assert/strict'

import { handler } from '../../../../../../core/component/evt/registerDone/handler.js'

test('handler is a no-op', () => {
  assert.doesNotThrow(() => handler())
})
