import { componentRegisterDone } from './componentRegisterDone.js'
import { componentAgentCmdRegisterProvidingAgentsComponent } from './componentAgentCmdRegisterProvidingAgentsComponent.js'

export async function publishEvents(args) {
  await componentRegisterDone(args)
  await componentAgentCmdRegisterProvidingAgentsComponent(args)
}
