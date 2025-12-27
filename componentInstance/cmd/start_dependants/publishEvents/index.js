import { publishStartCommands } from './publishStartCommands.js'

export async function publishEvents(args) {
  await publishStartCommands(args)
}
