#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const UPSTREAM_FILE = join(ROOT, 'upstream.json')
const DESKTOP_MANIFEST = join(ROOT, 'apps/desktop/package.json')
const RUNTIME_BASELINE_FILE = join(ROOT, 'packages/plugin-market/src/compatibility.ts')
const UPSTREAM_REPOSITORY = 'https://github.com/deepseek-ai/deepseek-harness.git'
const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']

function usage() {
  return `Usage: corepack yarn upstream:update [options]

Options:
  --version <version>  Upgrade to an explicit DSH version (for example 0.1.1-rc.2)
  --dry-run            Resolve and report the upgrade without changing files
  --skip-check         Skip the full build, typecheck, and test suite
  --package            Build and verify the platform directory package after checks
  --help               Show this help

Without --version, the newest official GitHub release whose tag starts with dsh-v is used.
`
}

export function parseArgs(argv) {
  const options = { dryRun: false, package: false, skipCheck: false, version: undefined }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--dry-run') options.dryRun = true
    else if (argument === '--package') options.package = true
    else if (argument === '--skip-check') options.skipCheck = true
    else if (argument === '--help' || argument === '-h') options.help = true
    else if (argument === '--version') {
      options.version = argv[index + 1]
      index += 1
      if (options.version === undefined) throw new Error('--version requires a value')
    } else {
      throw new Error(`Unknown option: ${argument}`)
    }
  }
  return options
}

export function isDshPackage(name) {
  return name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')
}

export function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u.exec(version)
  if (match === null) return undefined
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split('.') ?? [],
  }
}

export function compareSemver(leftVersion, rightVersion) {
  const left = parseSemver(leftVersion)
  const right = parseSemver(rightVersion)
  if (left === undefined || right === undefined) throw new Error('Cannot compare invalid semantic versions')
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] - right[key]
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    return right.prerelease.length - left.prerelease.length
  }
  const length = Math.max(left.prerelease.length, right.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index]
    const rightPart = right.prerelease[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    if (leftPart === rightPart) continue
    const leftNumber = /^\d+$/u.test(leftPart) ? Number(leftPart) : undefined
    const rightNumber = /^\d+$/u.test(rightPart) ? Number(rightPart) : undefined
    if (leftNumber !== undefined && rightNumber !== undefined) return leftNumber - rightNumber
    if (leftNumber !== undefined) return -1
    if (rightNumber !== undefined) return 1
    return leftPart.localeCompare(rightPart, 'en')
  }
  return 0
}

export function selectLatestReleaseTag(releases) {
  const candidates = releases
    .filter(release => release?.draft !== true && typeof release?.tag_name === 'string')
    .map(release => ({ tag: release.tag_name, version: release.tag_name.replace(/^dsh-v/u, '') }))
    .filter(candidate => candidate.tag.startsWith('dsh-v') && parseSemver(candidate.version) !== undefined)
    .sort((left, right) => compareSemver(right.version, left.version))
  if (candidates.length === 0) throw new Error('No official dsh-v* GitHub release was found')
  return candidates[0]
}

function run(command, args, { capture = false, mirror = false } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: process.env,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    })
    let stdout = ''
    let stderr = ''
    if (capture) {
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', chunk => {
        stdout += chunk
        if (mirror) process.stdout.write(chunk)
      })
      child.stderr.on('data', chunk => {
        stderr += chunk
        if (mirror) process.stderr.write(chunk)
      })
    }
    child.on('error', rejectPromise)
    child.on('close', code => {
      if (code === 0) resolvePromise(stdout)
      else {
        const output = `${stdout}${stderr}`.trim()
        rejectPromise(new Error(`${command} ${args.join(' ')} exited with ${code}${output ? `\n${output}` : ''}`))
      }
    })
  })
}

async function discoverLatestRelease() {
  const output = await run('git', ['ls-remote', '--tags', '--refs', UPSTREAM_REPOSITORY, 'refs/tags/dsh-v*'], { capture: true })
  const releases = output.trim().split('\n').filter(Boolean).map(line => ({
    draft: false,
    tag_name: line.slice(line.indexOf('refs/tags/') + 'refs/tags/'.length),
  }))
  return selectLatestReleaseTag(releases)
}

async function resolveTagCommit(tag) {
  const reference = `refs/tags/${tag}`
  const output = await run('git', ['ls-remote', '--tags', UPSTREAM_REPOSITORY, reference, `${reference}^{}`], { capture: true })
  const rows = output.trim().split('\n').filter(Boolean).map(line => line.split(/\s+/u))
  const peeled = rows.find(([, name]) => name === `${reference}^{}`)
  const direct = rows.find(([, name]) => name === reference)
  const commit = (peeled ?? direct)?.[0]
  if (!/^[0-9a-f]{40}$/u.test(commit ?? '')) throw new Error(`Could not resolve ${tag} to a full Git commit`)
  return commit
}

export function createManifestLoader(fetchManifest) {
  const cache = new Map()
  return (name, version) => {
    const key = `${name}@${version}`
    if (!cache.has(key)) cache.set(key, fetchManifest(name, version))
    return cache.get(key)
  }
}

const loadRegistryManifest = createManifestLoader(async (name, version) => {
  try {
    const installed = JSON.parse(await readFile(join(ROOT, 'node_modules', ...name.split('/'), 'package.json'), 'utf8'))
    if (installed.version === version) return installed
  } catch (cause) {
    if (cause.code !== 'ENOENT') throw cause
  }
  try {
    const output = await run('npm', ['view', `${name}@${version}`, '--json'], { capture: true })
    return JSON.parse(output)
  } catch (cause) {
    if (/E404|No match found|is not in this registry/u.test(cause.message)) return undefined
    throw cause
  }
})

export async function collectDshClosure(rootNames, version, loadManifest) {
  const pending = [...new Set(rootNames)].filter(isDshPackage)
  const visited = new Set()
  const missing = new Set()
  while (pending.length > 0) {
    const batch = pending.splice(0, 16).filter(name => !visited.has(name))
    if (batch.length === 0) continue
    const manifests = await Promise.all(batch.map(name => loadManifest(name, version)))
    for (let index = 0; index < batch.length; index += 1) {
      const name = batch[index]
      const manifest = manifests[index]
      visited.add(name)
      if (manifest === undefined) {
        missing.add(name)
        continue
      }
      const optionalPeers = manifest.peerDependenciesMeta ?? {}
      const edges = [
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.optionalDependencies ?? {}),
        ...Object.keys(manifest.peerDependencies ?? {}).filter(peer => optionalPeers[peer]?.optional !== true),
      ]
      for (const dependency of edges) {
        if (isDshPackage(dependency) && !visited.has(dependency)) pending.push(dependency)
      }
    }
  }
  for (const name of missing) visited.delete(name)
  return { packages: visited, missing }
}

export async function collectInstalledDshClosure(rootNames, version, readManifest) {
  const pending = [...new Set(rootNames)].filter(isDshPackage)
  const packages = new Set()
  const missing = new Set()
  while (pending.length > 0) {
    const name = pending.shift()
    if (packages.has(name) || missing.has(name)) continue
    const manifest = await readManifest(name, version)
    if (manifest === undefined) {
      missing.add(name)
      continue
    }
    packages.add(name)
    const optionalPeers = manifest.peerDependenciesMeta ?? {}
    const edges = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}).filter(peer => optionalPeers[peer]?.optional !== true),
    ]
    for (const dependency of edges) {
      if (isDshPackage(dependency) && !packages.has(dependency)) pending.push(dependency)
    }
  }
  return { packages, missing }
}

async function readInstalledManifest(name, version) {
  try {
    const manifest = JSON.parse(await readFile(join(ROOT, 'node_modules', ...name.split('/'), 'package.json'), 'utf8'))
    return manifest.version === version ? manifest : undefined
  } catch (cause) {
    if (cause.code === 'ENOENT') return undefined
    throw cause
  }
}

async function workspaceManifestPaths() {
  const paths = []
  for (const parent of ['apps', 'packages']) {
    const entries = await readdir(join(ROOT, parent), { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) paths.push(join(ROOT, parent, entry.name, 'package.json'))
    }
  }
  return paths
}

function dependencyRoots(manifest) {
  return Object.keys(manifest.dependencies ?? {}).filter(isDshPackage)
}

function exactOrPreservedRange(previous, version) {
  const prefix = /^(\^|~|>=|>|<=|<)/u.exec(previous)?.[1] ?? ''
  return `${prefix}${version}`
}

export async function updateWorkspaceManifest(manifest, version, loadManifest) {
  const updated = structuredClone(manifest)
  const removed = []
  const changed = []
  for (const section of DEPENDENCY_SECTIONS) {
    if (updated[section] === undefined) continue
    for (const [name, previous] of Object.entries(updated[section])) {
      if (!isDshPackage(name)) continue
      const published = await loadManifest(name, version)
      if (published === undefined) {
        delete updated[section][name]
        removed.push(name)
      } else {
        const next = exactOrPreservedRange(previous, version)
        updated[section][name] = next
        if (next !== previous) changed.push(name)
      }
    }
  }
  return { manifest: updated, removed, changed }
}

function sortObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right, 'en')))
}

export function synchronizeDesktopRuntime(manifest, packages, version) {
  const updated = structuredClone(manifest)
  const dependencies = { ...(updated.dependencies ?? {}) }
  for (const name of Object.keys(dependencies)) {
    if (isDshPackage(name)) delete dependencies[name]
  }
  for (const name of packages) dependencies[name] = version
  updated.dependencies = sortObject(dependencies)
  return updated
}

async function writeJsonAtomic(filename, value) {
  const temporary = `${filename}.update-dsh-${process.pid}`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
  await rename(temporary, filename)
}

export function unpublishedPackagesFromInstallError(message) {
  const packages = new Set()
  for (const match of message.matchAll(/(@deepseek-ai\/dsh(?:-[a-z0-9-]+)?)@npm:[^:\s]+: No candidates found/giu)) {
    packages.add(match[1])
  }
  return packages
}

function removeDshPackages(manifests, packageNames) {
  let changes = 0
  for (const manifest of manifests.values()) {
    for (const section of DEPENDENCY_SECTIONS) {
      if (manifest[section] === undefined) continue
      for (const name of packageNames) {
        if (manifest[section][name] === undefined) continue
        delete manifest[section][name]
        changes += 1
      }
    }
  }
  return changes
}

async function writeWorkspaceManifests(manifests) {
  for (const [filename, manifest] of manifests) await writeJsonAtomic(filename, manifest)
}

async function installWithRecovery(manifests, removed) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await run('corepack', ['yarn', 'install'], { capture: true, mirror: true })
      return
    } catch (cause) {
      const unavailable = unpublishedPackagesFromInstallError(cause.message)
      if (unavailable.size === 0 || removeDshPackages(manifests, unavailable) === 0) throw cause
      unavailable.forEach(name => removed.add(name))
      process.stderr.write(`Removing unpublished packages: ${[...unavailable].sort().join(', ')}\n`)
      await writeWorkspaceManifests(manifests)
    }
  }
  throw new Error('Yarn install did not converge after removing unpublished DSH packages')
}

function dshDependencySet(manifest) {
  return new Set(Object.keys(manifest.dependencies ?? {}).filter(isDshPackage))
}

function equalSets(left, right) {
  return left.size === right.size && [...left].every(value => right.has(value))
}

async function convergeDesktopRuntime(manifests, closureRoots, version, removed) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const closure = await collectInstalledDshClosure(closureRoots, version, readInstalledManifest)
    const unresolved = new Set([...closure.missing].filter(name => !removed.has(name)))
    const desired = new Set([...closure.packages, ...unresolved])
    const current = dshDependencySet(manifests.get(DESKTOP_MANIFEST))
    if (equalSets(current, desired) && unresolved.size === 0) return closure
    manifests.set(
      DESKTOP_MANIFEST,
      synchronizeDesktopRuntime(manifests.get(DESKTOP_MANIFEST), desired, version),
    )
    await writeJsonAtomic(DESKTOP_MANIFEST, manifests.get(DESKTOP_MANIFEST))
    await installWithRecovery(manifests, removed)
  }
  throw new Error('Desktop DSH runtime closure did not converge')
}

export function replaceRuntimeBaseline(text, previousVersion, nextVersion) {
  const pattern = /export const DEEPRUNNER_DSH_RUNTIME_VERSION = '([^']+)'/u
  const match = pattern.exec(text)
  if (match === null) throw new Error('DeepRunner DSH runtime baseline declaration was not found')
  if (match[1] !== previousVersion) {
    throw new Error(`DeepRunner DSH runtime baseline is ${match[1]}, expected ${previousVersion}`)
  }
  return text.replace(pattern, `export const DEEPRUNNER_DSH_RUNTIME_VERSION = '${nextVersion}'`)
}

async function updateRuntimeBaseline(previousVersion, nextVersion, dryRun) {
  const before = await readFile(RUNTIME_BASELINE_FILE, 'utf8')
  const after = replaceRuntimeBaseline(before, previousVersion, nextVersion)
  if (after === before) return false
  if (!dryRun) await writeFile(RUNTIME_BASELINE_FILE, after)
  return true
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(usage())
    return
  }

  const previous = JSON.parse(await readFile(UPSTREAM_FILE, 'utf8'))
  const selected = options.version === undefined
    ? await discoverLatestRelease()
    : { tag: `dsh-v${options.version}`, version: options.version }
  if (parseSemver(selected.version) === undefined) throw new Error(`Invalid DSH version: ${selected.version}`)

  process.stdout.write(`Resolving ${selected.tag}...\n`)
  const [commit, topLevelManifest] = await Promise.all([
    resolveTagCommit(selected.tag),
    loadRegistryManifest('@deepseek-ai/dsh', selected.version),
  ])
  if (topLevelManifest === undefined) throw new Error(`@deepseek-ai/dsh@${selected.version} is not published on npm`)

  const manifestPaths = await workspaceManifestPaths()
  const manifests = new Map()
  const removed = new Set()
  const changedDependencies = new Set()
  for (const filename of manifestPaths) {
    const original = JSON.parse(await readFile(filename, 'utf8'))
    const update = await updateWorkspaceManifest(original, selected.version, async () => ({}))
    manifests.set(filename, update.manifest)
    update.changed.forEach(name => changedDependencies.add(name))
  }

  const closureRoots = new Set(['@deepseek-ai/dsh', '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
  for (const [filename, manifest] of manifests) {
    if (filename === DESKTOP_MANIFEST) continue
    dependencyRoots(manifest).forEach(name => closureRoots.add(name))
  }
  const targetChanged = previous.runtimePackageVersion !== selected.version
    || previous.sourceCommit !== commit
  if (targetChanged) {
    manifests.set(
      DESKTOP_MANIFEST,
      synchronizeDesktopRuntime(manifests.get(DESKTOP_MANIFEST), closureRoots, selected.version),
    )
  }

  const nextUpstream = {
    ...previous,
    sourceCommit: commit,
    sourceVersion: selected.version,
    runtimePackageVersion: selected.version,
    updatedAt: targetChanged ? new Date().toISOString() : previous.updatedAt,
  }
  const runtimeBaselineChanged = await updateRuntimeBaseline(
    previous.runtimePackageVersion,
    selected.version,
    options.dryRun,
  )

  if (options.dryRun) {
    const installedClosure = selected.version === previous.runtimePackageVersion
      ? await collectInstalledDshClosure(closureRoots, selected.version, readInstalledManifest)
      : undefined
    process.stdout.write([
      `DSH: ${previous.runtimePackageVersion} -> ${selected.version}`,
      `Source commit: ${previous.sourceCommit} -> ${commit}`,
      `Desktop runtime closure: ${installedClosure === undefined ? 'resolved during install' : `${installedClosure.packages.size} installed packages`}`,
      `Workspace dependencies updated: ${changedDependencies.size}`,
      `Runtime baseline updated: ${runtimeBaselineChanged ? 'yes' : 'no'}`,
    ].join('\n') + '\n')
    process.stdout.write('Dry run complete; no files were changed.\n')
    return
  }

  await writeWorkspaceManifests(manifests)
  await writeJsonAtomic(UPSTREAM_FILE, nextUpstream)

  await installWithRecovery(manifests, removed)
  const closure = await convergeDesktopRuntime(manifests, closureRoots, selected.version, removed)
  if (!options.skipCheck) await run('corepack', ['yarn', 'check'])
  if (options.package) await run('corepack', ['yarn', 'package:dir'])
  process.stdout.write([
    `DeepRunner now targets DSH ${selected.version}.`,
    `Source commit: ${commit}`,
    `Desktop runtime closure: ${closure.packages.size} DSH packages`,
    `Removed unpublished packages: ${removed.size === 0 ? 'none' : [...removed].sort().join(', ')}`,
  ].join('\n') + '\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`DeepRunner DSH update failed: ${error.stack ?? error.message}\n`)
    process.exitCode = 1
  })
}
