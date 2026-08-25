import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { DeepRunnerProfiles } from '@deeprunner/contracts'
import type { DeepRunnerRuntimeIdentity } from '@deeprunner/contracts/internal/runtime'
import type {
  DeepRunnerMarketCatalog,
  DeepRunnerMarketCatalogEntryView,
  DeepRunnerMarketCatalogSourceView,
  DeepRunnerMarketCatalogView,
  DeepRunnerMarketEntry,
  DeepRunnerMarketRelease,
  DeepRunnerMarketRevocation,
  DeepRunnerMarketTrustLevel,
} from './contract.js'
import {
  auditDeepRunnerInstalledPlugin,
  DEEPRUNNER_DSH_RUNTIME_VERSION,
  defaultDeepRunnerRuntimeIdentity,
  marketReleaseCompatibility,
  readDisabledDeepRunnerPlugins,
  readDeepRunnerMarketReceipts,
} from './compatibility.js'

const ID_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u
const PACKAGE_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u
const INTEGRITY_PATTERN = /^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$/u
const MAX_ENTRIES = 1_000
const MAX_TEXT = 12_000
const MAX_INSTALLED_MANIFEST_BYTES = 64 * 1024

export const DEEPRUNNER_MARKET_SCHEMA_VERSION = 1

export const BUILTIN_MARKET_CATALOG: DeepRunnerMarketCatalog = {
  schemaVersion: DEEPRUNNER_MARKET_SCHEMA_VERSION,
  catalogVersion: '2026.08.23.2',
  generatedAt: '2026-08-23T00:00:00.000Z',
  sourceId: 'deeprunner-official',
  sourceRevision: 'embedded-2026.08.23.2',
  entries: [
    {
      id: 'deeprunner-desktop',
      packageName: '@deeprunner/desktop-plugin',
      displayName: 'DeepRunner Desktop',
      summary: 'DeepRunner desktop shell, Profile recovery and package runtime.',
      description: 'The launcher-owned DeepRunner desktop integration. It provides the current Profile identity, recovery flow, terminal environment and the package operation service used by this market.',
      publisher: 'DeepRunner',
      trustLevel: 'builtin',
      license: 'UNLICENSED',
      tags: ['desktop', 'profile', 'terminal'],
      status: 'listed',
      release: {
        version: '0.1.0',
        sourceRevision: 'workspace',
        publishedAt: '2026-08-23T00:00:00.000Z',
        dshVersionRange: DEEPRUNNER_DSH_RUNTIME_VERSION,
        deepRunnerVersionRange: '^0.1.0',
        platforms: ['darwin', 'win32', 'linux'],
        faces: ['host', 'client'],
        capabilities: ['profile-management', 'package-operations', 'system-terminal'],
      },
    },
    {
      id: 'deeprunner-plugin-market',
      packageName: '@deeprunner/plugin-market',
      displayName: 'DeepRunner Plugin Market',
      summary: 'Controlled plugin discovery with explicit trust labels.',
      description: 'The built-in market surface and Host policy layer. It reads the controlled catalog and delegates every package mutation to the DeepRunner package service.',
      publisher: 'DeepRunner',
      trustLevel: 'builtin',
      license: 'UNLICENSED',
      tags: ['market', 'plugins'],
      status: 'listed',
      release: {
        version: '0.1.0',
        sourceRevision: 'workspace',
        publishedAt: '2026-08-23T00:00:00.000Z',
        dshVersionRange: DEEPRUNNER_DSH_RUNTIME_VERSION,
        deepRunnerVersionRange: '^0.1.0',
        platforms: ['darwin', 'win32', 'linux'],
        faces: ['host', 'client'],
        capabilities: ['catalog-read', 'package-operations'],
      },
    },
  ],
}

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
}

function stringField(record: Record<string, unknown>, key: string, max = MAX_TEXT): string {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.includes('\0')) {
    throw new Error(`${key} must be a non-empty bounded string`)
  }
  return value
}

function optionalString(record: Record<string, unknown>, key: string, max = MAX_TEXT): string | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.includes('\0')) {
    throw new Error(`${key} must be a non-empty bounded string when present`)
  }
  return value
}

function stringArray(record: Record<string, unknown>, key: string, maxItems = 64): string[] {
  const value = record[key]
  if (!Array.isArray(value) || value.length > maxItems
    || value.some(item => typeof item !== 'string' || item.length === 0 || item.length > 128)) {
    throw new Error(`${key} must be a bounded string array`)
  }
  return [...value] as string[]
}

function isoDate(value: string, key: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)
    || Number.isNaN(Date.parse(value))) {
    throw new Error(`${key} must be an ISO UTC timestamp`)
  }
  return value
}

function parseRelease(
  value: unknown,
  trustLevel: DeepRunnerMarketTrustLevel,
  packageName: string,
): DeepRunnerMarketRelease {
  assertObject(value, 'release')
  const version = stringField(value, 'version', 128)
  if (!SEMVER_PATTERN.test(version)) throw new Error('release.version must be exact semver')
  const exactSpec = optionalString(value, 'exactSpec', 512)
  const distIntegrity = optionalString(value, 'distIntegrity', 256)
  if (exactSpec?.endsWith('@latest') === true || exactSpec?.endsWith('@next') === true) {
    throw new Error('release.exactSpec must not use a moving dist tag')
  }
  if (trustLevel !== 'builtin') {
    if (exactSpec === undefined) throw new Error('installable release requires exactSpec')
    if (distIntegrity === undefined || !INTEGRITY_PATTERN.test(distIntegrity)) {
      throw new Error('installable release requires sha integrity')
    }
    if (exactSpec !== `${packageName}@${version}`) {
      throw new Error('release.exactSpec must pin the catalog package and version')
    }
  }
  const platforms = stringArray(value, 'platforms', 3)
  if (platforms.some(platform => platform !== 'darwin' && platform !== 'win32' && platform !== 'linux')) {
    throw new Error('release.platforms contains an unsupported platform')
  }
  const faces = stringArray(value, 'faces', 2)
  if (faces.some(face => face !== 'host' && face !== 'client')) {
    throw new Error('release.faces contains an unsupported face')
  }
  const architectures = value.architectures === undefined
    ? undefined
    : stringArray(value, 'architectures', 16)
  const deepRunnerVersionRange = optionalString(value, 'deepRunnerVersionRange', 128)
  const buildScriptPackages = value.buildScriptPackages === undefined
    ? undefined
    : stringArray(value, 'buildScriptPackages', 32)
  if (buildScriptPackages?.some(packageName => !PACKAGE_PATTERN.test(packageName))) {
    throw new Error('release.buildScriptPackages contains an invalid package name')
  }
  if (buildScriptPackages !== undefined && new Set(buildScriptPackages).size !== buildScriptPackages.length) {
    throw new Error('release.buildScriptPackages must not contain duplicates')
  }
  const releaseNotes = optionalString(value, 'releaseNotes')
  return {
    version,
    ...(exactSpec === undefined ? {} : { exactSpec }),
    ...(distIntegrity === undefined ? {} : { distIntegrity }),
    sourceRevision: stringField(value, 'sourceRevision', 256),
    publishedAt: isoDate(stringField(value, 'publishedAt', 64), 'publishedAt'),
    dshVersionRange: stringField(value, 'dshVersionRange', 128),
    ...(deepRunnerVersionRange === undefined ? {} : { deepRunnerVersionRange }),
    platforms: platforms as DeepRunnerMarketRelease['platforms'],
    ...(architectures === undefined ? {} : { architectures }),
    faces: faces as DeepRunnerMarketRelease['faces'],
    capabilities: stringArray(value, 'capabilities'),
    ...(buildScriptPackages === undefined ? {} : { buildScriptPackages }),
    ...(releaseNotes === undefined ? {} : { releaseNotes }),
  }
}

function parseEntry(value: unknown): DeepRunnerMarketEntry {
  assertObject(value, 'entry')
  const id = stringField(value, 'id', 214)
  const packageName = stringField(value, 'packageName', 214)
  if (!ID_PATTERN.test(id)) throw new Error(`invalid market entry id ${JSON.stringify(id)}`)
  if (!PACKAGE_PATTERN.test(packageName)) throw new Error(`invalid package name ${JSON.stringify(packageName)}`)
  const trustLevel = stringField(value, 'trustLevel', 32)
  if (trustLevel !== 'builtin' && trustLevel !== 'verified-publisher' && trustLevel !== 'community') {
    throw new Error(`invalid trust level ${JSON.stringify(trustLevel)}`)
  }
  const status = stringField(value, 'status', 32)
  if (status !== 'listed' && status !== 'paused' && status !== 'deprecated') {
    throw new Error(`invalid market entry status ${JSON.stringify(status)}`)
  }
  const repository = optionalString(value, 'repository', 2_048)
  const homepage = optionalString(value, 'homepage', 2_048)
  for (const [label, candidate] of [['repository', repository], ['homepage', homepage]] as const) {
    if (candidate !== undefined && new URL(candidate).protocol !== 'https:') {
      throw new Error(`${label} must use HTTPS`)
    }
  }
  return {
    id,
    packageName,
    displayName: stringField(value, 'displayName', 160),
    summary: stringField(value, 'summary', 320),
    description: stringField(value, 'description'),
    publisher: stringField(value, 'publisher', 160),
    trustLevel,
    ...(repository === undefined ? {} : { repository }),
    ...(homepage === undefined ? {} : { homepage }),
    license: stringField(value, 'license', 128),
    tags: stringArray(value, 'tags'),
    status,
    release: parseRelease(value.release, trustLevel, packageName),
  }
}

function parseRevocation(value: unknown): DeepRunnerMarketRevocation {
  assertObject(value, 'revocation')
  const action = stringField(value, 'action', 32)
  if (action !== 'block-install' && action !== 'recommend-remove') {
    throw new Error(`invalid revocation action ${JSON.stringify(action)}`)
  }
  const version = optionalString(value, 'version', 128)
  if (version !== undefined && !SEMVER_PATTERN.test(version)) {
    throw new Error('revocation.version must be exact semver')
  }
  return {
    pluginId: stringField(value, 'pluginId', 128),
    ...(version === undefined ? {} : { version }),
    reason: stringField(value, 'reason', 1_000),
    action,
    publishedAt: isoDate(stringField(value, 'publishedAt', 64), 'publishedAt'),
  }
}

/** Parse an untrusted JSON catalog into a bounded immutable domain value. */
export function parseDeepRunnerMarketCatalog(value: unknown): DeepRunnerMarketCatalog {
  assertObject(value, 'catalog')
  if (value.schemaVersion !== DEEPRUNNER_MARKET_SCHEMA_VERSION) {
    throw new Error(`unsupported market schema version ${String(value.schemaVersion)}`)
  }
  if (!Array.isArray(value.entries) || value.entries.length > MAX_ENTRIES) {
    throw new Error('catalog.entries must be a bounded array')
  }
  const entries = value.entries.map(parseEntry)
  const ids = new Set<string>()
  const packages = new Set<string>()
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`duplicate market id ${JSON.stringify(entry.id)}`)
    if (packages.has(entry.packageName)) {
      throw new Error(`duplicate market package ${JSON.stringify(entry.packageName)}`)
    }
    ids.add(entry.id)
    packages.add(entry.packageName)
  }
  const revocations = value.revocations === undefined
    ? undefined
    : Array.isArray(value.revocations) && value.revocations.length <= MAX_ENTRIES
      ? value.revocations.map(parseRevocation)
      : (() => { throw new Error('catalog.revocations must be a bounded array') })()
  for (const revocation of revocations ?? []) {
    if (!ids.has(revocation.pluginId)) {
      throw new Error(`revocation references unknown plugin ${JSON.stringify(revocation.pluginId)}`)
    }
  }
  return structuredClone({
    schemaVersion: DEEPRUNNER_MARKET_SCHEMA_VERSION,
    catalogVersion: stringField(value, 'catalogVersion', 128),
    generatedAt: isoDate(stringField(value, 'generatedAt', 64), 'generatedAt'),
    sourceId: stringField(value, 'sourceId', 128),
    sourceRevision: stringField(value, 'sourceRevision', 256),
    entries,
    ...(revocations === undefined ? {} : { revocations }),
  })
}

export interface DeepRunnerMarketCatalogServiceOptions {
  readonly catalog?: unknown
  readonly profiles: DeepRunnerProfiles
  readonly platform?: NodeJS.Platform
  readonly architecture?: string
  readonly source?: DeepRunnerMarketCatalogSourceView
  readonly runtime?: DeepRunnerRuntimeIdentity
}

/** Generation-scoped read model over one validated controlled market catalog. */
export class DeepRunnerMarketCatalogService {
  private catalogValue: DeepRunnerMarketCatalog
  private sourceValue: DeepRunnerMarketCatalogSourceView
  private readonly profiles: DeepRunnerProfiles
  private readonly platform: NodeJS.Platform
  private readonly architecture: string
  private readonly runtime: DeepRunnerRuntimeIdentity

  constructor(options: DeepRunnerMarketCatalogServiceOptions) {
    this.catalogValue = parseDeepRunnerMarketCatalog(options.catalog ?? BUILTIN_MARKET_CATALOG)
    this.sourceValue = structuredClone(options.source ?? { kind: 'embedded' })
    this.profiles = options.profiles
    this.platform = options.platform ?? process.platform
    this.architecture = options.architecture ?? process.arch
    this.runtime = structuredClone(options.runtime ?? defaultDeepRunnerRuntimeIdentity())
  }

  get catalog(): DeepRunnerMarketCatalog {
    return this.catalogValue
  }

  get source(): DeepRunnerMarketCatalogSourceView {
    return structuredClone(this.sourceValue)
  }

  /** Replace only third-party rows while launcher-owned system entries stay local. */
  adoptExternalCatalog(
    value: unknown,
    source: DeepRunnerMarketCatalogSourceView,
  ): DeepRunnerMarketCatalog {
    const external = parseDeepRunnerMarketCatalog(value)
    if (external.entries.some(entry => entry.trustLevel === 'builtin')) {
      throw new Error('remote catalog cannot declare built-in components')
    }
    const builtins = BUILTIN_MARKET_CATALOG.entries.filter(entry => entry.trustLevel === 'builtin')
    const builtinIds = new Set(builtins.map(entry => entry.id))
    const builtinPackages = new Set(builtins.map(entry => entry.packageName))
    for (const entry of external.entries) {
      if (builtinIds.has(entry.id) || builtinPackages.has(entry.packageName)) {
        throw new Error('remote catalog collides with a built-in component')
      }
    }
    const combined = parseDeepRunnerMarketCatalog({
      ...external,
      entries: [...builtins, ...external.entries],
    })
    this.catalogValue = combined
    this.sourceValue = structuredClone(source)
    return combined
  }

  setSource(source: DeepRunnerMarketCatalogSourceView): void {
    this.sourceValue = structuredClone(source)
  }

  entry(id: string): DeepRunnerMarketEntry | undefined {
    return this.entries().find(entry => entry.id === id)
  }

  private entries(): readonly DeepRunnerMarketEntry[] {
    const catalogPackages = new Set(this.catalog.entries.map(entry => entry.packageName))
    const sideloaded = readDeepRunnerMarketReceipts(this.profiles.current.dir)
      .map(receipt => receipt.sideloadedEntry)
      .filter((entry): entry is DeepRunnerMarketEntry => entry !== undefined
        && !catalogPackages.has(entry.packageName))
    return [...this.catalog.entries, ...sideloaded]
  }

  view(): DeepRunnerMarketCatalogView {
    const profile = this.profiles.list().find(item => item.name === this.profiles.current.name)
    const installedBundles = new Set(profile?.bundles ?? [])
    const disabledBundles = readDisabledDeepRunnerPlugins(this.profiles.current.dir)
    const receipts = readDeepRunnerMarketReceipts(this.profiles.current.dir)
    const entries: DeepRunnerMarketCatalogEntryView[] = this.entries().map((entry) => {
      const compatibility = marketReleaseCompatibility(
        entry,
        this.runtime,
        this.platform,
        this.architecture,
      )
      const revoked = this.catalog.revocations?.some(revocation => revocation.pluginId === entry.id
        && (revocation.version === undefined || revocation.version === entry.release.version)) ?? false
      const revocation = revoked
        ? this.catalog.revocations?.find(item => item.pluginId === entry.id
          && (item.version === undefined || item.version === entry.release.version))
        : undefined
      const installed = entry.trustLevel === 'builtin' || installedBundles.has(entry.packageName)
      const installedVersion = installed ? this.installedVersion(entry) : undefined
      const audit = !installed || entry.trustLevel === 'builtin'
        ? undefined
        : auditDeepRunnerInstalledPlugin(this.profiles.current.dir, entry.packageName, this.runtime)
      const receipt = installed ? receipts.find(item => item.packageName === entry.packageName
        && (installedVersion === undefined || item.version === installedVersion)) : undefined
      const installationOrigin = !installed
        ? undefined
        : entry.trustLevel === 'builtin' || (receipt !== undefined && receipt.sideloadSource === undefined)
          ? 'market' as const
          : receipt?.sideloadSource?.kind === 'npm'
            ? 'sideload-npm' as const
            : receipt?.sideloadSource?.kind === 'github'
              ? 'sideload-github' as const
              : undefined
      const activationStatus = !installed
        ? 'not-installed'
        : entry.trustLevel === 'builtin'
          ? 'active'
          : audit?.compatible !== true
            ? 'quarantined'
            : disabledBundles.has(entry.packageName)
              ? 'disabled'
              : audit.managed
                ? 'active'
                : 'unverified'
      return {
        ...entry,
        installed,
        ...(installedVersion === undefined ? {} : { installedVersion }),
        compatible: compatibility.compatible,
        ...(compatibility.reason === undefined ? {} : { compatibilityReason: compatibility.reason }),
        activationStatus,
        ...(activationStatus === 'disabled'
          ? { activationReason: 'Disabled by the user. The package remains installed and can be enabled again.' }
          : activationStatus === 'unverified'
            ? { activationReason: 'Installed outside Market; provenance and native ABI are not fully verified.' }
            : activationStatus === 'quarantined' && audit?.reason !== undefined
              ? { activationReason: audit.reason }
              : {}),
        marketManaged: entry.trustLevel === 'builtin' || audit?.managed === true,
        revoked,
        ...(revocation === undefined ? {} : { revocationReason: revocation.reason }),
        ...(installationOrigin === undefined ? {} : { installationOrigin }),
        canCheckSideloadUpdates: installationOrigin === 'sideload-npm'
          && entry.trustLevel === 'sideloaded',
        canSwitchToMarket: installationOrigin !== undefined
          && installationOrigin !== 'market' && entry.trustLevel !== 'sideloaded',
      }
    })
    return {
      schemaVersion: DEEPRUNNER_MARKET_SCHEMA_VERSION,
      catalogVersion: this.catalog.catalogVersion,
      generatedAt: this.catalog.generatedAt,
      sourceId: this.catalog.sourceId,
      source: this.source,
      profile: this.profiles.current.name,
      entries,
    }
  }

  private installedVersion(entry: DeepRunnerMarketEntry): string | undefined {
    if (entry.trustLevel === 'builtin') return entry.release.version
    try {
      const manifestPath = join(this.profiles.current.dir, 'node_modules', entry.packageName, 'package.json')
      if (statSync(manifestPath).size > MAX_INSTALLED_MANIFEST_BYTES) return undefined
      const value: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
      const version = (value as { version?: unknown }).version
      return typeof version === 'string' && SEMVER_PATTERN.test(version) ? version : undefined
    } catch {
      return undefined
    }
  }
}
