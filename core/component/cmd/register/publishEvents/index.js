import { componentRegistered } from './componentRegistered.js'

export async function publishEvents(args) {
  await componentRegistered(args)
}
