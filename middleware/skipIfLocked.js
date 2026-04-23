import { JetStreamApiCodes, JetStreamApiError } from '@nats-io/jetstream'
import { s } from '@liquid-bricks/lib-nats-subject/router'

import { Errors } from '../errors.js'

const ROUTE_LOCK_BUCKET = 'component-service-route-locks'
const ROUTE_LOCK_TTL_MS = 60_000

const lockBuckets = new WeakMap()

function encodeLockToken(value) {
  const encoded = Buffer.from(`${value ?? ''}`)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

  return encoded.length > 0 ? encoded : '_'
}

function validateLockKeys(lockKeys, diagnostics) {
  diagnostics.require(
    Array.isArray(lockKeys),
    Errors.PRECONDITION_INVALID,
    'skipIfLocked requires an array of scope keys',
    { lockKeys }
  )
  diagnostics.require(
    lockKeys.length > 0,
    Errors.PRECONDITION_REQUIRED,
    'skipIfLocked requires at least one scope key',
    { lockKeys }
  )
  diagnostics.require(
    lockKeys.every(key => typeof key === 'string' && key.length > 0),
    Errors.PRECONDITION_INVALID,
    'skipIfLocked keys must be non-empty strings',
    { lockKeys }
  )

  return lockKeys
}

async function getRouteLockBucket(natsContext) {
  let bucketPromise = lockBuckets.get(natsContext)
  if (!bucketPromise) {
    bucketPromise = (async () => {
      const kvm = await natsContext.Kvm()
      return kvm.create(ROUTE_LOCK_BUCKET, {
        history: 1,
        ttl: ROUTE_LOCK_TTL_MS,
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

function getMatchedRouteValues(info = {}) {
  const values = info?.values
  const tokens = Array.isArray(info?.tokens) ? info.tokens : []

  if (!values || typeof values !== 'object') return []

  return tokens
    .filter(token => Object.prototype.hasOwnProperty.call(values, token))
    .map(token => values[token])
}

function getLockScopeValues(scope = {}, lockKeys = []) {
  return Object.fromEntries(lockKeys.map(key => [key, scope[key]]))
}

function getLockReason(values = {}) {
  if (values.entity && values.action) {
    return `${values.entity} ${values.action} already locked.`
  }

  const label = Object.values(values)
    .map(value => `${value}`)
    .join(' ')
    .trim()

  return label.length > 0
    ? `${label} already locked.`
    : 'route already locked.'
}

export function createLockKey({ info = {}, scope = {}, lockKeys = [] }) {
  const matchedRouteValues = getMatchedRouteValues(info)
  const scopeValues = lockKeys.map(key => encodeLockToken(scope[key]))

  return matchedRouteValues.concat(scopeValues).join('.')
}

export function skipIfLocked(lockKeys) {
  return async function skipIfLocked({
    info,
    message,
    rootCtx: { diagnostics, natsContext },
    scope,
  }) {
    const normalizedLockKeys = validateLockKeys(lockKeys, diagnostics)
    const values = info?.values
    const abortCtl = scope[s.scope.ac]

    diagnostics.require(
      values && Object.keys(values).length > 0,
      Errors.PRECONDITION_REQUIRED,
      'skipIfLocked requires matched route values',
      { values, info }
    )
    diagnostics.require(
      natsContext && typeof natsContext.Kvm === 'function',
      Errors.PRECONDITION_REQUIRED,
      'skipIfLocked requires natsContext.Kvm',
      { values }
    )
    diagnostics.require(
      abortCtl && typeof abortCtl.abort === 'function',
      Errors.PRECONDITION_REQUIRED,
      'skipIfLocked requires an abort controller',
      { values }
    )

    for (const key of normalizedLockKeys) {
      diagnostics.require(
        Object.prototype.hasOwnProperty.call(scope, key),
        Errors.PRECONDITION_REQUIRED,
        `skipIfLocked scope key "${key}" is required`,
        { key, values }
      )
    }

    const lockKey = createLockKey({ info, scope, lockKeys: normalizedLockKeys })
    const lockValues = getLockScopeValues(scope, normalizedLockKeys)
    const bucket = await getRouteLockBucket(natsContext)

    try {
      await bucket.create(lockKey, JSON.stringify({
        routeValues: values,
        values: lockValues,
        subject: message?.subject,
        acquiredAt: new Date().toISOString(),
      }))
    } catch (error) {
      if (isCasConflict(error)) {
        return abortCtl.abort({
          reason: getLockReason(values),
          lockKey,
          ...lockValues,
        })
      }

      throw error
    }
  }
}
