import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


export async function componentAgentCmdRegisterProvidingAgentsComponent({
  scope: { agentID, component: { hash } },
  rootCtx: { natsContext },
}) {
  const subject = createBasicSubject(natsEvents['*'].component_service['*']['*'].exec.componentAgent.cmdRegisterProvidingAgentsComponent.v1['*']).forPublish()
    .env('prod')
    .id(agentID)

  await natsContext.publish(
    subject.build(),
    JSON.stringify({
      data: { agentID, hash },
    })
  )
}
