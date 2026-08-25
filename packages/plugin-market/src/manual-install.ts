import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import type { DeepRunnerProfiles } from '@deeprunner/contracts'
import type { DeepRunnerRuntimeIdentity } from '@deeprunner/contracts/internal/runtime'
import type {
  DeepRunnerMarketEntry,
  DeepRunnerMarketManualResolveView,
  DeepRunnerMarketOperationView,
} from './contract.js'
import {
  defaultDeepRunnerRuntimeIdentity,
  marketReleaseCompatibility,
  readDeepRunnerMarketReceipts,
} from './compatibility.js'
import { DeepRunnerMarketOperationService } from './operations.js'

const MAX_SOURCE_LENGTH = 2_048
const MAX_RESPONSE_BYTES = 512 * 1024
const TOKEN_LIMIT = 32
const TOKEN_TTL_MS = 5 * 60 * 1_000
const PACKAGE_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u
const INTEGRITY_PATTERN = /^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$/u
const NATIVE_DEPENDENCIES = new Set(['node-pty', 'koffi', 'sharp', 'better-sqlite3'])

interface SemverApi {
  valid(version: string): string | null
  validRange(range: string): string | null
  satisfies(version: string, range: string, options?: { includePrerelease?: boolean }): boolean
  gt(version: string, other: string): boolean
}

const semver = createRequire(import.meta.url)('semver') as SemverApi

interface ManualTokenRecord extends DeepRunnerMarketManualResolveView {
  readonly entry: DeepRunnerMarketEntry
}

interface PackageInput {
  readonly packageName: string
  readonly version?: string
  readonly sourceKind: 'npm' | 'github'
  readonly normalizedSource: string
  readonly githubRepository?: string
}

export interface DeepRunnerManualInstallServiceOptions {
  readonly operations: DeepRunnerMarketOperationService
  readonly profiles: DeepRunnerProfiles
  readonly runtime?: DeepRunnerRuntimeIdentity
  readonly fetcher?: typeof fetch
  readonly now?: () => Date
  readonly id?: () => string
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is invalid`)
  }
  return value as Record<string, unknown>
}

function optionalObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function boundedText(value: unknown, fallback: string, max = 12_000): string {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !value.includes('\0')
    ? value
    : fallback
}

function splitPackageSpec(source: string): { packageName: string; version?: string } {
  const separator = source.startsWith('@') ? source.lastIndexOf('@') : source.indexOf('@')
  const hasVersion = source.startsWith('@') ? separator > source.indexOf('/') : separator > 0
  const packageName = hasVersion ? source.slice(0, separator) : source
  const version = hasVersion ? source.slice(separator + 1) : undefined
  if (!PACKAGE_PATTERN.test(packageName)) throw new Error('Enter a valid NPM package name or package page URL')
  if (version !== undefined && semver.valid(version) === null) {
    throw new Error('Manual installs accept only an exact version, not a tag or version range')
  }
  return { packageName, ...(version === undefined ? {} : { version }) }
}

function parseInput(raw: string): PackageInput | { readonly githubRepository: string } {
  const source = raw.trim()
  if (source.length === 0 || source.length > MAX_SOURCE_LENGTH || source.includes('\0')) {
    throw new Error('Enter an NPM package name, NPM package URL, or public GitHub repository URL')
  }
  if (!source.includes('://')) {
    const parsed = splitPackageSpec(source)
    return { ...parsed, sourceKind: 'npm', normalizedSource: parsed.version === undefined
      ? parsed.packageName : `${parsed.packageName}@${parsed.version}` }
  }
  let url: URL
  try { url = new URL(source) } catch { throw new Error('Source URL is invalid') }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') {
    throw new Error('Only public HTTPS NPM and GitHub URLs are supported')
  }
  if (url.hostname === 'www.npmjs.com' || url.hostname === 'npmjs.com') {
    const prefix = '/package/'
    if (!url.pathname.startsWith(prefix)) throw new Error('Use an NPM package page URL')
    const parsed = splitPackageSpec(decodeURIComponent(url.pathname.slice(prefix.length)).replace(/\/$/u, ''))
    return { ...parsed, sourceKind: 'npm', normalizedSource: `https://www.npmjs.com/package/${parsed.packageName}` }
  }
  if (url.hostname === 'github.com') {
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length !== 2) throw new Error('Use the root URL of a public GitHub repository')
    const repository = `https://github.com/${parts[0]}/${parts[1]?.replace(/\.git$/u, '')}`
    return { githubRepository: repository }
  }
  throw new Error('Only npmjs.com and github.com sources are supported')
}

function repositoryUrl(value: unknown): string | undefined {
  const raw = typeof value === 'string' ? value : optionalObject(value)?.url
  if (typeof raw !== 'string') return undefined
  const githubShortcut = /^github:([^/]+\/[^/]+)$/u.exec(raw)
  if (githubShortcut !== null) return `https://github.com/${githubShortcut[1]?.replace(/\.git$/u, '')}`
  const normalized = raw.replace(/^git\+/, '').replace(/^git:\/\//, 'https://')
    .replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git(?:#.*)?$/u, '')
  try {
    const url = new URL(normalized)
    if (url.protocol !== 'https:' || url.hostname !== 'github.com') return undefined
    const parts = url.pathname.split('/').filter(Boolean)
    return parts.length >= 2 ? `https://github.com/${parts[0]}/${parts[1]}` : undefined
  } catch { return undefined }
}

function packageAuthor(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 160)
  const name = optionalObject(value)?.name
  return typeof name === 'string' && name.length > 0 ? name.slice(0, 160) : 'Unknown publisher'
}

function stringArray(value: unknown, allowed?: ReadonlySet<string>): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0 && item.length <= 128
    && (allowed === undefined || allowed.has(item))).slice(0, 64)
}

function dshVersionRange(manifest: Record<string, unknown>): string {
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    const dependencies = optionalObject(manifest[field])
    if (dependencies === undefined) continue
    for (const [name, range] of Object.entries(dependencies)) {
      if (name.startsWith('@deepseek-ai/dsh-') && typeof range === 'string' && semver.validRange(range) !== null) {
        return range
      }
    }
  }
  return '*'
}

function dependencies(manifest: Record<string, unknown>): Set<string> {
  const result = new Set<string>()
  for (const field of ['dependencies', 'optionalDependencies']) {
    for (const name of Object.keys(optionalObject(manifest[field]) ?? {})) result.add(name)
  }
  return result
}

function lifecycleScripts(manifest: Record<string, unknown>): string[] {
  const scripts = optionalObject(manifest.scripts)
  if (scripts === undefined) return []
  return ['preinstall', 'install', 'postinstall'].filter(name => typeof scripts[name] === 'string')
}

/** Resolves only fixed public hosts and returns a bounded JSON object. */
async function fetchJson(fetcher: typeof fetch, url: string): Promise<Record<string, unknown>> {
  const response = await fetcher(url, {
    redirect: 'error',
    headers: { accept: 'application/json', 'user-agent': 'DeepRunner-Plugin-Market' },
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(`Source lookup failed (${String(response.status)})`)
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new Error('Source metadata is too large')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new Error('Source metadata is too large')
  return object(JSON.parse(new TextDecoder().decode(bytes)) as unknown, 'Source metadata')
}

/** Read-only resolver for public NPM artifacts and public GitHub-to-NPM discovery. */
export class DeepRunnerManualInstallService {
  private readonly operations: DeepRunnerMarketOperationService
  private readonly profiles: DeepRunnerProfiles
  private readonly runtime: DeepRunnerRuntimeIdentity
  private readonly fetcher: typeof fetch
  private readonly now: () => Date
  private readonly id: () => string
  private readonly tokens = new Map<string, ManualTokenRecord>()
  private resolving = false

  constructor(options: DeepRunnerManualInstallServiceOptions) {
    this.operations = options.operations
    this.profiles = options.profiles
    this.runtime = structuredClone(options.runtime ?? defaultDeepRunnerRuntimeIdentity())
    this.fetcher = options.fetcher ?? fetch
    this.now = options.now ?? (() => new Date())
    this.id = options.id ?? randomUUID
  }

  async resolve(source: string): Promise<DeepRunnerMarketManualResolveView> {
    if (this.resolving) throw new Error('Another manual source is already being inspected')
    this.resolving = true
    try {
      return await this.resolveSource(source)
    } finally {
      this.resolving = false
    }
  }

  private async resolveSource(
    source: string,
    allowInstalled = false,
    sourceOverride?: { readonly kind: 'npm' | 'github'; readonly normalizedSource: string },
  ): Promise<DeepRunnerMarketManualResolveView> {
    const parsed = parseInput(source)
    let input: PackageInput
    if ('packageName' in parsed) input = parsed
    else {
      const url = new URL(parsed.githubRepository)
      const [owner, repository] = url.pathname.split('/').filter(Boolean)
      const github = await fetchJson(this.fetcher,
        `https://api.github.com/repos/${encodeURIComponent(owner ?? '')}/${encodeURIComponent(repository ?? '')}/contents/package.json`)
      if (github.encoding !== 'base64' || typeof github.content !== 'string') {
        throw new Error('The GitHub repository has no readable root package.json')
      }
      let manifest: Record<string, unknown>
      try { manifest = object(JSON.parse(Buffer.from(github.content, 'base64').toString('utf8')) as unknown, 'package.json') }
      catch { throw new Error('The GitHub repository root package.json is invalid') }
      const packageName = manifest.name
      if (typeof packageName !== 'string' || !PACKAGE_PATTERN.test(packageName)) {
        throw new Error('The GitHub repository does not declare a publishable NPM package name')
      }
      input = { packageName, sourceKind: 'github', normalizedSource: parsed.githubRepository,
        githubRepository: parsed.githubRepository }
    }

    const endpoint = input.version ?? 'latest'
    const manifest = await fetchJson(this.fetcher,
      `https://registry.npmjs.org/${encodeURIComponent(input.packageName)}/${encodeURIComponent(endpoint)}`)
    const entry = this.entryFromManifest(manifest)
    if (entry.packageName !== input.packageName || (input.version !== undefined && entry.release.version !== input.version)) {
      throw new Error('NPM returned a different package identity than requested')
    }
    if (input.githubRepository !== undefined
      && repositoryUrl(manifest.repository)?.toLowerCase() !== input.githubRepository.toLowerCase()) {
      throw new Error('The published NPM package does not point back to this GitHub repository')
    }
    const current = this.profiles.list().find(item => item.name === this.profiles.current.name)
    const installed = current?.bundles.includes(entry.packageName) === true
    if (installed && !allowInstalled) {
      throw new Error('This package is already installed in the current Profile')
    }
    const installedVersion = installed
      ? readDeepRunnerMarketReceipts(this.profiles.current.dir)
        .find(receipt => receipt.packageName === entry.packageName)?.version
      : undefined
    const compatibility = marketReleaseCompatibility(entry, this.runtime, process.platform, process.arch)
    if (!compatibility.compatible) throw new Error(compatibility.reason ?? 'Plugin is incompatible')
    const engines = optionalObject(manifest.engines)
    if (typeof engines?.node === 'string' && (semver.validRange(engines.node) === null
      || !semver.satisfies(this.runtime.nodeVersion, engines.node, { includePrerelease: true }))) {
      throw new Error(`Requires Node.js ${engines.node}; this app embeds ${this.runtime.nodeVersion}`)
    }

    this.prune()
    const now = this.now()
    const record: ManualTokenRecord = {
      token: this.id(), expiresAt: new Date(now.getTime() + TOKEN_TTL_MS).toISOString(),
      profile: this.profiles.current.name, sourceKind: sourceOverride?.kind ?? input.sourceKind,
      normalizedSource: sourceOverride?.normalizedSource ?? input.normalizedSource, entry,
      warning: 'Sideloaded · Unverified. DeepRunner verified the published package identity and integrity, but has not reviewed its publisher or code.',
      ...(installedVersion === undefined ? {} : { installedVersion }),
      updateAvailable: installedVersion !== undefined && semver.gt(entry.release.version, installedVersion),
    }
    this.tokens.set(record.token, record)
    return structuredClone(record)
  }

  install(token: string): DeepRunnerMarketOperationView {
    const record = this.tokens.get(token)
    this.tokens.delete(token)
    if (record === undefined || Date.parse(record.expiresAt) <= this.now().getTime()) {
      throw new Error('Manual install preview is missing or expired')
    }
    if (record.profile !== this.profiles.current.name) {
      throw new Error('Profile changed after inspection; inspect the source again')
    }
    if (record.installedVersion !== undefined && !record.updateAvailable) {
      throw new Error('No newer NPM version is available')
    }
    return this.operations.startSideload(record.entry, {
      kind: record.sourceKind,
      normalizedSource: record.normalizedSource,
    }, record.installedVersion !== undefined)
  }

  async check(identifier: string): Promise<DeepRunnerMarketManualResolveView> {
    if (this.resolving) throw new Error('Another manual source is already being inspected')
    this.resolving = true
    try {
      const receipt = readDeepRunnerMarketReceipts(this.profiles.current.dir)
        .find(item => item.pluginId === identifier || item.packageName === identifier)
      if (receipt?.sideloadSource?.kind !== 'npm') {
        throw new Error('Only NPM sideloads can be checked for updates')
      }
      const installed = this.profiles.list().find(item => item.name === this.profiles.current.name)
        ?.bundles.includes(receipt.packageName) === true
      if (!installed) throw new Error('Plugin is not installed in the current Profile')
      return await this.resolveSource(receipt.packageName, true, receipt.sideloadSource)
    } finally {
      this.resolving = false
    }
  }

  private prune(): void {
    const now = this.now().getTime()
    for (const [token, record] of this.tokens) {
      if (Date.parse(record.expiresAt) <= now) this.tokens.delete(token)
    }
    while (this.tokens.size >= TOKEN_LIMIT) {
      const oldest = this.tokens.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.tokens.delete(oldest)
    }
  }

  private entryFromManifest(manifest: Record<string, unknown>): DeepRunnerMarketEntry {
    const packageName = manifest.name
    const version = manifest.version
    const dist = optionalObject(manifest.dist)
    const integrity = dist?.integrity
    const dsh = optionalObject(manifest.dsh)
    const bundle = optionalObject(dsh?.bundle)
    if (typeof packageName !== 'string' || !PACKAGE_PATTERN.test(packageName)
      || typeof version !== 'string' || semver.valid(version) === null) {
      throw new Error('Published package identity is invalid')
    }
    if (typeof integrity !== 'string' || !INTEGRITY_PATTERN.test(integrity)) {
      throw new Error('Published package has no supported immutable integrity')
    }
    if (typeof bundle?.patch !== 'string' || bundle.patch.length === 0 || bundle.patch.length > 512) {
      throw new Error('Package is not a DSH plugin: dsh.bundle.patch is missing')
    }
    const scripts = lifecycleScripts(manifest)
    const native = [...dependencies(manifest)].filter(name => NATIVE_DEPENDENCIES.has(name))
    if (scripts.length > 0 || native.length > 0) {
      const names = [...scripts.map(name => `${name} script`), ...native]
      throw new Error(`V1 sideloading does not run install scripts or native builds (${names.join(', ')})`)
    }
    const faces = stringArray(dsh?.faces, new Set(['host', 'client']))
    const capabilities = stringArray(dsh?.capabilities)
    const repository = repositoryUrl(manifest.repository)
    const description = boundedText(manifest.description, 'No description was published for this package.')
    const id = `sideload-${createHash('sha256').update(packageName).digest('hex').slice(0, 16)}`
    return {
      id, packageName, displayName: boundedText(manifest.displayName, packageName, 160),
      summary: description.slice(0, 320), description,
      publisher: packageAuthor(manifest.author), trustLevel: 'sideloaded',
      ...(repository === undefined ? {} : { repository }),
      ...(typeof manifest.homepage === 'string' && manifest.homepage.startsWith('https://')
        ? { homepage: manifest.homepage.slice(0, 2_048) } : {}),
      license: boundedText(manifest.license, 'Unknown', 128),
      tags: stringArray(manifest.keywords), status: 'listed',
      release: {
        version, exactSpec: `${packageName}@${version}`, distIntegrity: integrity,
        sourceRevision: integrity, publishedAt: this.now().toISOString(),
        dshVersionRange: dshVersionRange(manifest),
        platforms: ['darwin', 'win32', 'linux'],
        faces: faces.length > 0 ? faces as ('host' | 'client')[] : ['host', 'client'],
        capabilities: capabilities.length > 0 ? capabilities : ['unreviewed-code'],
      },
    }
  }
}
