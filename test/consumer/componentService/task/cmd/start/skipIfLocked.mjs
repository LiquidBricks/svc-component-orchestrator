import test from 'node:test'
import assert from 'node:assert/strict'

import { JetStreamApiCodes, JetStreamApiError } from '@nats-io/jetstream'
import { s } from '@liquid-bricks/lib-nats-subject/router'

import { skipIfLocked, taskStartLockKey } from '../../../../../../task/cmd/start/skipIfLocked.js'
import { getRouteSpec } from '../../../helpers.mjs'

function createAbortCtl() {
  return {
    aborted: false,
    payload: null,
    abort(payload) {
      this.aborted = true
      this.payload = payload
    },
  }
}

function createNatsContextSpy() {
  const acquiredKeys = new Set()
  let bucketCreateCalls = 0

  return {
    get bucketCreateCalls() {
      return bucketCreateCalls
    },
    natsContext: {
      async Kvm() {
        return {
          async create() {
            bucketCreateCalls += 1

            return {
              async create(key) {
                if (acquiredKeys.has(key)) {
                  throw new JetStreamApiError({
                    err_code: JetStreamApiCodes.StreamWrongLastSequence,
                    description: 'wrong last sequence',
                    code: 400,
                  })
                }

                acquiredKeys.add(key)
                return acquiredKeys.size
              },
            }
          },
        }
      },
    },
  }
}

test('task start route acquires lock before loadData', () => {
  const taskSpec = getRouteSpec({ channel: 'cmd', entity: 'task', action: 'start' })

  assert.equal(taskSpec.pre[0].name, 'skipIfLocked')
  assert.ok(Array.isArray(taskSpec.pre[1]))
  assert.equal(taskSpec.pre[1][0].name, 'taskNodes')
})

test('skipIfLocked aborts duplicate task starts for the same task', async () => {
  const spy = createNatsContextSpy()
  const abortCtlA = createAbortCtl()
  const abortCtlB = createAbortCtl()
  const instanceId = 'instance-task-lock'
  const stateId = 'state-task-lock'
  const lockKey = taskStartLockKey({ instanceId, stateId })

  await skipIfLocked({
    rootCtx: { natsContext: spy.natsContext },
    scope: { instanceId, stateId, [s.scope.ac]: abortCtlA },
  })

  await skipIfLocked({
    rootCtx: { natsContext: spy.natsContext },
    scope: { instanceId, stateId, [s.scope.ac]: abortCtlB },
  })

  assert.equal(abortCtlA.aborted, false)
  assert.equal(abortCtlB.aborted, true)
  assert.deepEqual(abortCtlB.payload, {
    reason: 'task start already locked.',
    instanceId,
    stateId,
    lockKey,
  })
  assert.equal(spy.bucketCreateCalls, 1)
})

test('skipIfLocked allows different task start commands to proceed', async () => {
  const { natsContext } = createNatsContextSpy()
  const abortCtlA = createAbortCtl()
  const abortCtlB = createAbortCtl()

  await skipIfLocked({
    rootCtx: { natsContext },
    scope: {
      instanceId: 'instance-task-lock',
      stateId: 'state-task-lock-a',
      [s.scope.ac]: abortCtlA,
    },
  })

  await skipIfLocked({
    rootCtx: { natsContext },
    scope: {
      instanceId: 'instance-task-lock',
      stateId: 'state-task-lock-b',
      [s.scope.ac]: abortCtlB,
    },
  })

  assert.equal(abortCtlA.aborted, false)
  assert.equal(abortCtlB.aborted, false)
})
