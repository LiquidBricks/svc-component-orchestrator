import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { createComponentServiceRouter } from '../../router.js'

const noopNatsContext = Object.freeze({
  publish: async () => {},
})

export function createRouteMessage({ subject, data, json, ack } = {}) {
  let acked = false

  return {
    subject,
    ack() {
      acked = true
      return ack?.()
    },
    json() {
      if (typeof json === 'function') return json()
      if (json && typeof json === 'object') return json
      return data === undefined ? {} : { data }
    },
    get acked() {
      return acked
    },
  }
}

export async function invokeRoute(context, {
  path = {},
  subject,
  data,
  message,
  natsContext,
} = {}) {
  const routeSubject = subject ?? createBasicSubject().set(path).build()
  const routeMessage = message ?? createRouteMessage({ subject: routeSubject, data })
  const effectiveMessage = {
    ...routeMessage,
    subject: routeMessage.subject ?? routeSubject,
    ack: typeof routeMessage.ack === 'function' ? routeMessage.ack.bind(routeMessage) : (() => {}),
    json: typeof routeMessage.json === 'function'
      ? routeMessage.json.bind(routeMessage)
      : (() => (data === undefined ? {} : { data })),
  }

  const router = createComponentServiceRouter({
    natsContext: natsContext ?? context?.natsContext ?? noopNatsContext,
    g: context?.g,
    diagnostics: context?.diagnostics,
    dataMapper: context?.dataMapper,
  })

  return router.request({ subject: routeSubject, message: effectiveMessage })
}
