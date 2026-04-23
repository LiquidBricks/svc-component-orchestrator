import { s } from '@liquid-bricks/lib-nats-subject/router'

import { Errors } from '../../../../errors.js'
import { domain } from '@liquid-bricks/spec-domain/domain'

export async function republishIfGatesMissing({
  message,
  rootCtx: { g, natsContext },
  scope: { handlerDiagnostics, component, [s.scope.ac]: abortCtl },
}) {
  const { hash, name: compName, gates = [] } = component
  if (!gates.length) return

  const missingGates = []
  for (const gateItem of gates) {
    const { name: gateName, hash: gateHash } = gateItem ?? {}

    handlerDiagnostics.require(
      typeof gateName === 'string' && gateName.length,
      Errors.PRECONDITION_REQUIRED,
      'gate name required',
      { field: 'gate.name', component: compName, hash },
    )
    handlerDiagnostics.require(
      typeof gateHash === 'string' && gateHash.length,
      Errors.PRECONDITION_REQUIRED,
      'gate hash required',
      { field: 'gate.hash', component: compName, hash, gate: gateName },
    )

    const [gatedComponentId] = await g
      .V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', gateHash)
      .id()

    if (!gatedComponentId) {
      missingGates.push({ name: gateName, hash: gateHash })
    }
  }

  if (!missingGates.length) return

  await natsContext.publish(message.subject, JSON.stringify(message.json()))

  return abortCtl.abort({
    reason: 'gates not registered yet',
    hash,
    missingGates,
  })
}
