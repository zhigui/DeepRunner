import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const rootPackage = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const desktopPackage = JSON.parse(await readFile(resolve(root, 'apps/desktop/package.json'), 'utf8'))
if (rootPackage.version !== desktopPackage.version) throw new Error('root and desktop versions must match')
for (const name of ['contracts', 'desktop-plugin', 'plugin-market', 'test-fixtures']) {
  const workspace = JSON.parse(await readFile(resolve(root, 'packages', name, 'package.json'), 'utf8'))
  if (workspace.version !== rootPackage.version) throw new Error(`workspace ${name} version must match the release version`)
}
const tag = process.env.GITHUB_REF_NAME
if (tag !== undefined && tag !== `v${rootPackage.version}`) throw new Error(`tag ${tag} does not match package version v${rootPackage.version}`)
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(rootPackage.version)) throw new Error('release version must be exact semver')
console.log(`release version v${rootPackage.version} is consistent`)
