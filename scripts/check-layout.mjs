import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const expectedWorkspaceMembers = [
  'apps/desktop',
  'packages/contracts',
  'packages/desktop-plugin',
  'packages/plugin-market',
  'packages/test-fixtures',
]
const expectedFiles = [
  'LICENSE',
  'README.md',
  'THIRD_PARTY_NOTICES.md',
  'package.json',
  'tsconfig.base.json',
  'upstream.json',
  ...expectedWorkspaceMembers.map(member => `${member}/package.json`),
]

const failures = []

for (const relative of expectedFiles) {
  if (!existsSync(resolve(root, relative))) failures.push(`missing ${relative}`)
}

const rootManifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const workspaces = Array.isArray(rootManifest.workspaces) ? rootManifest.workspaces : []
if (JSON.stringify(workspaces) !== JSON.stringify(['apps/*', 'packages/*'])) {
  failures.push('root workspaces must be exactly ["apps/*", "packages/*"]')
}
if (rootManifest.packageManager !== 'yarn@4.18.0') {
  failures.push('root packageManager must remain yarn@4.18.0 until an explicit toolchain update')
}
if (rootManifest.license !== 'AGPL-3.0-or-later') {
  failures.push('root license must be AGPL-3.0-or-later')
}

const upstream = JSON.parse(readFileSync(resolve(root, 'upstream.json'), 'utf8'))
if (upstream.repository !== 'https://github.com/deepseek-ai/deepseek-harness.git') {
  failures.push('upstream repository must be the official DeepSeek Harness repository')
}
if (!/^[0-9a-f]{40}$/u.test(upstream.sourceCommit ?? '')) {
  failures.push('upstream sourceCommit must be a full Git commit')
}
if (!/^\d+\.\d+\.\d+-rc\.\d+$/u.test(upstream.runtimePackageVersion ?? '')) {
  failures.push('upstream runtimePackageVersion must be an exact rc family')
}

for (const member of expectedWorkspaceMembers) {
  const manifestPath = resolve(root, member, 'package.json')
  if (!existsSync(manifestPath)) continue
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.license !== 'AGPL-3.0-or-later') {
    failures.push(`${member}: license must be AGPL-3.0-or-later`)
  }
  for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
    const belongsToDshRuntimeFamily = name === '@deepseek-ai/dsh'
      || name.startsWith('@deepseek-ai/dsh-')
    if (belongsToDshRuntimeFamily && version !== upstream.runtimePackageVersion) {
      failures.push(`${member}: ${name} must use ${upstream.runtimePackageVersion}, found ${version}`)
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`DeepRunner layout check failed:\n- ${failures.join('\n- ')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`DeepRunner layout: ${expectedWorkspaceMembers.length} workspace members verified.\n`)
}
