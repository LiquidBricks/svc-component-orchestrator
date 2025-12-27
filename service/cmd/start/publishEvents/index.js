import { executionRequest } from './executionRequest.js'

export async function publishEvents(args) {
  await executionRequest(args)
}
