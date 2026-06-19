export function getCodeLocation(depth = 2) {
  const e = new Error()
  const stack = (e.stack || '').split('\n').map(s => s.trim()).filter(Boolean)

  const targetIndex = Math.min(depth, Math.max(1, stack.length - 1))
  let callerLine = stack[targetIndex] || stack[stack.length - 1] || ''

  const patterns = [
    /at (.*?) \((.*?):(\d+):(\d+)\)/,
    /at (.*?):(\d+):(\d+)/,
    /(.*?):(\d+):(\d+)$/
  ]

  let fn = null
  let file = import.meta.url
  let line = null
  let col = null

  for (const p of patterns) {
    const m = callerLine.match(p)
    if (m) {
      if (m.length === 5) {
        fn = m[1] || null
        file = m[2] || file
        line = m[3]
        col = m[4]
      } else if (m.length === 4) {
        if (p === patterns[1]) {
          file = m[1]
          line = m[2]
          col = m[3]
        } else {
          file = m[1]
          line = m[2]
          col = m[3]
        }
      }
      break
    }
  }

  if (!fn) {
    for (let i = targetIndex - 1; i >= 1; i--) {
      const lineCandidate = stack[i] || ''
      const m = lineCandidate.match(patterns[0])
      if (m && m[1]) {
        fn = m[1]
        break
      }
    }
  }

  if (typeof file === 'string' && file.startsWith('file://')) {
    try { file = new URL(file).pathname } catch (e) { }
  }

  return {
    file,
    line: line ? Number(line) : null,
    column: col ? Number(col) : null,
    functionName: fn,
    stack: stack.join('\n'),
  }
}
