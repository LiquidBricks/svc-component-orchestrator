import test from 'node:test'
import assert from 'node:assert/strict'

import { compileInjectionRoutingIndex } from '../../../../../../../core/componentAgent/cmd/registerComponent/handler/compileInjectionRoutingIndex.js'

function context(compile) {
  return {
    rootCtx: {
      dataMapper: {
        vertex: {
          component: {
            index: {
              injectionRouting: { compile },
            },
          },
        },
      },
    },
    scope: { componentVID: 'component-1' },
  }
}

test('compileInjectionRoutingIndex compiles the registered component index', async () => {
  const calls = []

  await compileInjectionRoutingIndex(context(async (input) => calls.push(input)))

  assert.deepEqual(calls, [{ componentId: 'component-1' }])
})

test('compileInjectionRoutingIndex propagates index compilation failures', async () => {
  const failure = new Error('compile failed')

  await assert.rejects(
    compileInjectionRoutingIndex(context(async () => { throw failure })),
    (error) => error === failure,
  )
})
