import { Errors } from '../../../../errors.js'

export const PROJECTION_RETRY_DELAYS_MS = Object.freeze([1_000, 2_000, 5_000, 10_000, 30_000])

function deliveryCountFor(message) {
  const deliveryCount = Number(message?.info?.deliveryCount)
  return Number.isInteger(deliveryCount) && deliveryCount > 0 ? deliveryCount : 1
}

export function projectionRetryDelayMs(deliveryCount) {
  const index = Math.min(
    deliveryCountFor({ info: { deliveryCount } }) - 1,
    PROJECTION_RETRY_DELAYS_MS.length - 1,
  )
  return PROJECTION_RETRY_DELAYS_MS[index]
}

export function retryProjectionTimeout({ error, message }) {
  if (error?.code !== Errors.COMPONENT_INSTANCE_COMPLETION_PROJECTION_TIMEOUT) throw error
  if (typeof message?.nak !== 'function') throw error

  const projectionDeliveryCount = deliveryCountFor(message)
  const retryDelayMs = projectionRetryDelayMs(projectionDeliveryCount)
  message.nak(retryDelayMs)

  return {
    projectionRetryScheduled: true,
    projectionRetryDelayMs: retryDelayMs,
    projectionDeliveryCount,
  }
}
