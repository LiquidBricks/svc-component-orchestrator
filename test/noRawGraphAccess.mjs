import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const codeExtensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx'])
const forbiddenPatterns = [
  {
    name: 'raw graph traversal',
    expression: /(^|[^A-Za-z0-9_$.])(?:g|ctx[.]g)\s*(?:[.]|[?][.])\s*(?:V|E|addV|addE|inject|mergeV|mergeE)(?![A-Za-z0-9_$])/gm,
  },
  {
    name: 'traversal-shaped dataMapper facade',
    expression: /dataMapper\s*(?:[.]|[?][.])\s*(?:query|mutation)\s*(?:[.]|[?][.])\s*[A-Za-z_$][A-Za-z0-9_$]*\s*(?:[.]|[?][.])\s*(?:V|E|addV|addE|inject|mergeV|mergeE)(?![A-Za-z0-9_$])/gm,
  },
]

function codeFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(entry.name)) continue
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) codeFiles(entryPath, files)
    else if (codeExtensions.has(path.extname(entry.name))) files.push(entryPath)
  }
  return files
}

test('graph database access uses concrete spec-domain dataMapper operations', () => {
  const violations = []
  for (const sourceRoot of ['core', 'test']) {
    for (const file of codeFiles(path.join(repoRoot, sourceRoot))) {
      if (file === fileURLToPath(import.meta.url)) continue
      const source = fs.readFileSync(file, 'utf8')
      for (const pattern of forbiddenPatterns) {
        for (const match of source.matchAll(pattern.expression)) {
          const line = source.slice(0, match.index).split('\n').length
          violations.push(`${path.relative(repoRoot, file)}:${line}: ${pattern.name}: ${match[0].replace(/\s+/g, ' ')}`)
        }
      }
    }
  }

  assert.deepEqual(violations, [])
})
