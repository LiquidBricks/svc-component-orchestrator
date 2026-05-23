import { componentInstanceCreateDone } from './componentInstanceCreateDone.js'

export async function publishEvents(args) {
  await componentInstanceCreateDone(args)
}
