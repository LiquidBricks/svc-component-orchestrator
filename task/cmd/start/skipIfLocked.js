import { JetStreamApiCodes, JetStreamApiError } from '@nats-io/jetstream'
import { s } from '@liquid-bricks/lib-nats-subject/router'

const TASK_START_LOCK_BUCKET = 'component-service-task-start-locks'
// Short-lived lock to collapse concurrent duplicate start commands.
const TASK_START_LOCK_TTL_MS = 60_000

const lockBuckets = new WeakMap()

function encodeLockToken(value) {
  const encoded = Buffer.from(`${value ?? ''}`)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

  return encoded.length > 0 ? encoded : '_'
}

export function taskStartLockKey({ instanceId, stateId }) {
  return [
    'task',
    'cmd',
    'start',
    encodeLockToken(instanceId),
    encodeLockToken(stateId),
  ].join('.')
}

async function getTaskStartLockBucket(natsContext) {
  let bucketPromise = lockBuckets.get(natsContext)
  if (!bucketPromise) {
    bucketPromise = (async () => {
      const kvm = await natsContext.Kvm()
      return kvm.create(TASK_START_LOCK_BUCKET, {
        history: 1,
        ttl: TASK_START_LOCK_TTL_MS,
      })
    })().catch(error => {
      lockBuckets.delete(natsContext)
      throw error
    })

    lockBuckets.set(natsContext, bucketPromise)
  }

  return bucketPromise
}

function isCasConflict(error) {
  const code = error instanceof JetStreamApiError
    ? error.code
    : error?.code ?? error?.err_code ?? error?.apiError?.()?.err_code

  return code === JetStreamApiCodes.StreamWrongLastSequence
    || code === JetStreamApiCodes.StreamWrongLastSequenceUnknown
}

export async function skipIfLocked({
  message,
  rootCtx: { natsContext },
  scope: { instanceId, stateId, [s.scope.ac]: abortCtl },
}) {
  const lockKey = taskStartLockKey({ instanceId, stateId })
  const bucket = await getTaskStartLockBucket(natsContext)

  try {
    await bucket.create(lockKey, JSON.stringify({
      instanceId,
      stateId,
      subject: message?.subject,
      acquiredAt: new Date().toISOString(),
    }))
  } catch (error) {
    if (isCasConflict(error)) {
      return abortCtl.abort({
        reason: 'task start already locked.',
        instanceId,
        stateId,
        lockKey,
      })
    }

    throw error
  }
}
