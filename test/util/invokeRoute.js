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

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

const mergeHookResults = (results) => {
  let merged
  let last
  for (const result of results) {
    if (result !== undefined) last = result
    if (result && typeof result === 'object') {
      if (!merged) merged = {}
      Object.assign(merged, result)
    }
  }
  return merged !== undefined ? merged : last
}

const mergeIntoScope = (args, result) => {
  if (result && typeof result === 'object' && args?.scope && typeof args.scope === 'object') {
    Object.assign(args.scope, result)
  }
}

const runHookSequence = async (hooks, args, { mergeScope = true } = {}) => {
  const results = []
  for (const hook of hooks) {
    const result = await hook(args)
    if (mergeScope) mergeIntoScope(args, result)
    results.push(result)
  }
  return mergeHookResults(results)
}

const asHookList = (hookGroup) => {
  if (Array.isArray(hookGroup)) {
    const hooks = []
    for (const hook of hookGroup) hooks.push(...asHookList(hook))
    return hooks
  }

  if (isPlainObject(hookGroup)) {
    const branches = Object.values(hookGroup).map(asHookList).filter(branch => branch.length > 0)
    if (branches.length === 0) return []
    if (branches.length === 1) return branches[0]
    return [async (args) => {
      const results = await Promise.all(branches.map(branch => runHookSequence(branch, args, { mergeScope: false })))
      return mergeHookResults(results)
    }]
  }

  if (typeof hookGroup !== 'function') throw new TypeError('fn is not a function')
  return [hookGroup]
}

export async function runHookGroup(hookGroup, args) {
  return runHookSequence(asHookList(hookGroup), args)
}

export async function invokeRoute(context, {
  path = {},
  subject,
  data,
  message,
  natsContext,
} = {}) {
  const routeSubject = subject ?? createBasicSubject().set(path).forPublish().build()
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
