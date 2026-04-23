// Stops the diagnostics timer; no domain-specific metadata
export function stopDiagnosticsTimer(fn) {
  return function (payload) {
    return payload.scope.timer.stop(fn(payload))
  }
}
