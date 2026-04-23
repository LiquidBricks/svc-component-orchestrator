import test from 'node:test'
import assert from 'node:assert/strict'

import { JetStreamApiCodes, JetStreamApiError } from '@nats-io/jetstream'
import { s } from '@liquid-bricks/lib-nats-subject/router'

import { createLockKey, skipIfLocked } from '../../../../../../middleware/index.js'
import { getRouteSpec, makeDiagnosticsInstance } from '../../../helpers.mjs'

const routeInfo = {
  tokens: ['env', 'ns', 'tenant', 'context', 'channel', 'entity', 'action', 'version', 'id'],
  params: { channel: 'cmd', entity: 'task', action: 'start' },
  values: { channel: 'cmd', entity: 'task', action: 'start' },
}

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
  const diagnostics = makeDiagnosticsInstance()
  const lock = skipIfLocked(['instanceId', 'stateId'])
  const lockKey = createLockKey({
    info: routeInfo,
    scope: { instanceId, stateId },
    lockKeys: ['instanceId', 'stateId'],
  })

  await lock({
    info: routeInfo,
    message: { subject: 'prod.component-service._._.cmd.task.start.v1._' },
    rootCtx: { diagnostics, natsContext: spy.natsContext },
    scope: { instanceId, stateId, [s.scope.ac]: abortCtlA },
  })

  await lock({
    info: routeInfo,
    message: { subject: 'prod.component-service._._.cmd.task.start.v1._' },
    rootCtx: { diagnostics, natsContext: spy.natsContext },
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
  const diagnostics = makeDiagnosticsInstance()
  const lock = skipIfLocked(['instanceId', 'stateId'])

  await lock({
    info: routeInfo,
    message: { subject: 'prod.component-service._._.cmd.task.start.v1._' },
    rootCtx: { diagnostics, natsContext },
    scope: {
      instanceId: 'instance-task-lock',
      stateId: 'state-task-lock-a',
      [s.scope.ac]: abortCtlA,
    },
  })

  await lock({
    info: routeInfo,
    message: { subject: 'prod.component-service._._.cmd.task.start.v1._' },
    rootCtx: { diagnostics, natsContext },
    scope: {
      instanceId: 'instance-task-lock',
      stateId: 'state-task-lock-b',
      [s.scope.ac]: abortCtlB,
    },
  })

  assert.equal(abortCtlA.aborted, false)
  assert.equal(abortCtlB.aborted, false)
})
