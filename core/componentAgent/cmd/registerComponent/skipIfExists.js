
import { domain } from '@liquid-bricks/spec-domain/domain'

export async function skipIfExists({ rootCtx: { g }, scope: { component: { hash } } }) {
  const ids = await g
    .V()
    .has('label', domain.vertex.component.constants.LABEL)
    .has('hash', hash)
    .id()

  if (ids.length > 0) {
    return {
      componentVID: ids[0],
      componentAlreadyRegistered: true,
      componentRegistrationCount: ids.length,
    }
  }

  return { componentAlreadyRegistered: false }
}
