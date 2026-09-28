// Opt in with node --import=./test/util/workspaceImports.mjs to test sibling package changes together.
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const workspace = fileURLToPath(new URL('../../../', import.meta.url))
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@liquid-bricks/')) {
      const [name, ...subpath] = specifier.slice('@liquid-bricks/'.length).split('/')
      const root = path.join(workspace, name)
      const manifest = path.join(root, 'package.json')
      if (existsSync(manifest)) {
        const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
        const key = subpath.length ? `./${subpath.join('/')}` : '.'
        const target = pkg.exports?.[key] ?? (key === '.' ? pkg.main : undefined)
        if (typeof target === 'string') return nextResolve(pathToFileURL(path.join(root, target)).href, context)
      }
    }
    return nextResolve(specifier, context)
  },
})
