// Common post middleware to ack messages
export function ackMessage({ message }) {
  message.ack()
}
