// No-op receipt middleware: logs receipt, performs no validation/timing
export function acknowledgeReceipt({ message, rootCtx: { diagnostics } }) {
  diagnostics.info('message received (acknowledgeReceipt)', { subject: message.subject })
}
