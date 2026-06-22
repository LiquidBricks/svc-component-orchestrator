import test from 'node:test'
import assert from 'node:assert/strict'


import { registerSpec, withGraphContext } from './helpers.mjs'

const skipIfExists = registerSpec.pre.find(fn => fn.name === 'skipIfExists')

test('skipIfExists resolves existing component without aborting', async () => {
  assert.ok(skipIfExists, 'skipIfExists pre hook missing')

  await withGraphContext(async ({ g, dataMapper }) => {
    const hash = 'dupe-hash'

    for (let i = 0; i < 3; i += 1) {
      await dataMapper.vertex.component.create({ hash, name: 'Existing-' + (i + 1) })
    }

    const result = await skipIfExists({
      rootCtx: { g, dataMapper },
      scope: { component: { hash } },
    })

    assert.equal(result.componentAlreadyRegistered, true)
    assert.equal(result.componentRegistrationCount, 3)
    assert.ok(result.componentVID)
  })
})
