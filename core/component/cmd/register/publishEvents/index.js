import { componentRegisterDone } from './componentRegisterDone.js'

export async function publishEvents(args) {
  await componentRegisterDone(args)
}
