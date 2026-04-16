import test from 'node:test'
import assert from 'node:assert/strict'

import { s } from '@liquid-bricks/lib-nats-subject/router'

import { registerSpec, withGraphContext } from './helpers.mjs'

const skipIfExists = registerSpec.pre.find(fn => fn.name === 'skipIfExists')

test('skipIfExists aborts when existing component found', async () => {
  assert.ok(skipIfExists, 'skipIfExists pre hook missing')

  await withGraphContext(async ({ g, dataMapper }) => {
    const abortCtl = { aborted: false, payload: null, abort(payload) { this.aborted = true; this.payload = payload } }
    const hash = 'dupe-hash'

    for (let i = 0; i < 3; i += 1) {
      await dataMapper.vertex.component.create({ hash, name: `Existing-${i + 1}` })
    }

    await skipIfExists({
      rootCtx: { g },
      scope: { component: { hash }, [s.scope.ac]: abortCtl },
    })

    assert.equal(abortCtl.aborted, true)
    assert.deepEqual(abortCtl.payload, {
      reason: 'component already registered.',
      hash,
      count: 3,
    })
  })
})
