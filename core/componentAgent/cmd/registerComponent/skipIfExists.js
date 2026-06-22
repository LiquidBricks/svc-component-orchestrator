
import { domain } from '@liquid-bricks/spec-domain/domain'

export async function skipIfExists({ rootCtx: { g, dataMapper }, scope: { component: { hash } } }) {
  const ids = await dataMapper.query.findComponentIdByHash({ hash })

  if (ids.length > 0) {
    return {
      componentVID: ids[0],
      componentAlreadyRegistered: true,
      componentRegistrationCount: ids.length,
    }
  }

  return { componentAlreadyRegistered: false }
}
