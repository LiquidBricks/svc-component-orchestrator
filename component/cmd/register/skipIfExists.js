import { s } from '@liquid-bricks/lib-nats-subject/router'

import { domain } from '@liquid-bricks/spec-domain/domain'

export async function skipIfExists({ rootCtx: { g }, scope: { component: { hash }, [s.scope.ac]: abortCtl } }) {
  const ids = await g
    .V()
    .has('label', domain.vertex.component.constants.LABEL)
    .has('hash', hash)
    .id()

  if (ids.length > 0) {
    return abortCtl.abort({
      reason: 'component already registered.',
      hash: hash,
      count: ids.length,
    })
  }
}
