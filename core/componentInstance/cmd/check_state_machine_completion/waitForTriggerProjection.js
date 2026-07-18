import { Errors } from '../../../../errors.js'

const DEFAULT_TIMEOUT_MS = 5_000
const DEFAULT_INTERVAL_MS = 25

function pickFirst(value) {
  return Array.isArray(value) ? value[0] : value
}

function valueFor(values, key) {
  if (!values || typeof values !== 'object') return values
  return pickFirst(values[key])
}

function finiteNonNegative(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function expectedGateResult({ result, resultValue }) {
  if (typeof resultValue === 'string') return resultValue
  return result != null ? JSON.stringify(result) : ''
}

async function readTriggerProjection({ dataMapper, scope }) {
  if (scope.type === 'gate') {
    const [resultValues] = await dataMapper.query.readResultValues({
      edgeId: scope.stateEdgeId,
    })
    return valueFor(resultValues, 'result')
  }

  const [statusValues] = await dataMapper.query.readStateEdgeStatus({
    edgeId: scope.stateEdgeId,
  })
  return valueFor(statusValues, 'status')
}

function expectedTriggerProjection(scope) {
  return scope.type === 'gate'
    ? expectedGateResult(scope)
    : (scope.stateEdgeStatus ?? scope.status)
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function waitForTriggerProjection({
  scope,
  rootCtx: {
    dataMapper,
    projectionReadinessTimeoutMs,
    projectionReadinessIntervalMs,
  },
}) {
  const timeoutMs = finiteNonNegative(projectionReadinessTimeoutMs, DEFAULT_TIMEOUT_MS)
  const intervalMs = finiteNonNegative(projectionReadinessIntervalMs, DEFAULT_INTERVAL_MS)
  const expected = expectedTriggerProjection(scope)
  const deadline = Date.now() + timeoutMs
  let observed
  let lastReadError

  while (true) {
    try {
      observed = await readTriggerProjection({ dataMapper, scope })
      lastReadError = undefined
      if (observed === expected) return
    } catch (error) {
      lastReadError = error
    }

    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) break
    await delay(Math.min(Math.max(intervalMs, 1), remainingMs))
  }

  const trigger = scope.type === 'gate'
    ? { stateEdgeId: scope.stateEdgeId, gateInstanceRefId: scope.gateInstanceRefId }
    : { stateEdgeId: scope.stateEdgeId }

  scope.handlerDiagnostics.require(
    false,
    Errors.COMPONENT_INSTANCE_COMPLETION_PROJECTION_TIMEOUT,
    'Timed out waiting for the completion trigger projection',
    {
      type: scope.type,
      ...trigger,
      expected,
      observed,
      timeoutMs,
      lastReadError: lastReadError
        ? {
            name: lastReadError.name,
            code: lastReadError.code,
            message: lastReadError.message ?? String(lastReadError),
          }
        : undefined,
    },
  )
}
