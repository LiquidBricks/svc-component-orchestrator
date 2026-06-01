import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function componentAgentCmdRegisterProvidingAgentsComponent({
  scope: { agentID, component: { hash } },
  rootCtx: { natsContext },
}) {
  const subject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('componentAgent')
    .channel('exec')
    .action('cmdRegisterProvidingAgentsComponent')
    .version('v1')
    .id(agentID)

  await natsContext.publish(
    subject.build(),
    JSON.stringify({
      data: { agentID, hash },
    })
  )
}
