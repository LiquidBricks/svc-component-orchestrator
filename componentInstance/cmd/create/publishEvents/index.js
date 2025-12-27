import { componentInstanceCreated } from './componentInstanceCreated.js'

export async function publishEvents(args) {
  await componentInstanceCreated(args)
}
