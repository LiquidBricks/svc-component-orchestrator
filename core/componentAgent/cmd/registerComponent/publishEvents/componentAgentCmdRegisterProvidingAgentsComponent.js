import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function componentAgentCmdRegisterProvidingAgentsComponent({
  scope: { agentID, component: { hash } },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  const subject = createBasicSubject(emits['component_service.exec.componentAgent.cmdRegisterProvidingAgentsComponent.v1']).forPublish()
    .env('prod')
    .id(agentID)

  await natsContext.publish(
    subject.build(),
    JSON.stringify({
      data: { agentID, hash },
    })
  )
}
