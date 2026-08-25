import { randomUUID } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import type { DeepRunnerRuntimeIdentity } from '@deeprunner/contracts/internal/runtime'
import { parse as parseYaml } from 'yaml'
import type { DeepRunnerMarketEntry } from './contract.js'

const MAX_MANIFEST_BYTES = 256 * 1024
const MAX_RECEIPT_BYTES = 512 * 1024
const MAX_LOCKFILE_BYTES = 16 * 1024 * 1024
const RECEIPT_SCHEMA_VERSION = 1
const RECEIPT_DIRECTORY = join('.deeprunner', 'market')
const RECEIPT_FILENAME = 'install-receipts-v1.json'
const STATE_FILENAME = 'plugin-state-v1.json'
const NATIVE_DEPENDENCIES = new Set(['node-pty', 'koffi', 'sharp', 'better-sqlite3'])

export const DEEPRUNNER_DSH_RUNTIME_VERSION = '0.1.1-rc.2'

interface SemverApi {
  valid(version: string): string | null
  validRange(range: string): string | null
  satisfies(version: string, range: string, options?: { includePrerelease?: boolean }): boolean
}

const semver = createRequire(import.meta.url)('semver') as SemverApi

export interface DeepRunnerMarketInstallReceipt {
  readonly schemaVersion: 1
  readonly pluginId: string
  readonly profile: string
  readonly packageName: string
  readonly version: string
  readonly sourceId: string
  readonly catalogVersion: string
  readonly sourceRevision: string
  readonly distIntegrity: string
  readonly bundlePatch: string
  readonly buildScriptPackages: readonly string[]
  readonly installedAt: string
  readonly installedRuntime: DeepRunnerRuntimeIdentity
  /** Persisted only for packages discovered outside the controlled catalog. */
  readonly sideloadedEntry?: DeepRunnerMarketEntry
  readonly sideloadSource?: {
    readonly kind: 'npm' | 'github'
    readonly normalizedSource: string
  }
}

interface ReceiptFile {
  readonly schemaVersion: 1
  readonly receipts: readonly DeepRunnerMarketInstallReceipt[]
}

interface PluginStateFile {
  readonly schemaVersion: 1
  readonly disabled: readonly string[]
}

export interface DeepRunnerInstalledPluginAudit {
  readonly compatible: boolean
  readonly managed: boolean
  readonly reason?: string
  readonly version?: string
  readonly receipt?: DeepRunnerMarketInstallReceipt
}

export function defaultDeepRunnerRuntimeIdentity(): DeepRunnerRuntimeIdentity {
  return {
    deepRunnerVersion: '0.1.0',
    dshVersion: DEEPRUNNER_DSH_RUNTIME_VERSION,
    cordisVersion: '4.0.1',
    nodeVersion: process.versions.node,
    electronVersion: process.versions.electron ?? '0.0.0',
    nodeModulesVersion: process.versions.modules,
    architecture: process.arch,
  }
}

function satisfies(version: string, range: string): boolean {
  return semver.valid(version) !== null
    && semver.validRange(range) !== null
    && semver.satisfies(version, range, { includePrerelease: true })
}

export function marketReleaseCompatibility(
  entry: DeepRunnerMarketEntry,
  runtime: DeepRunnerRuntimeIdentity,
  platform: NodeJS.Platform,
  architecture: string,
): { readonly compatible: boolean; readonly reason?: string } {
  if (!entry.release.platforms.includes(platform as 'darwin' | 'win32' | 'linux')) {
    return { compatible: false, reason: `Not available on ${platform}` }
  }
  if (entry.release.architectures !== undefined
    && !entry.release.architectures.includes(architecture)) {
    return { compatible: false, reason: `Not available for ${architecture}` }
  }
  if (!satisfies(runtime.dshVersion, entry.release.dshVersionRange)) {
    return {
      compatible: false,
      reason: `Requires DSH ${entry.release.dshVersionRange}; this app provides ${runtime.dshVersion}`,
    }
  }
  const appRange = entry.release.deepRunnerVersionRange
  if (appRange !== undefined && !satisfies(runtime.deepRunnerVersion, appRange)) {
    return {
      compatible: false,
      reason: `Requires DeepRunner ${appRange}; this app is ${runtime.deepRunnerVersion}`,
    }
  }
  return { compatible: true }
}

function privateDirectory(profileDir: string, create: boolean): string {
  const root = join(profileDir, '.deeprunner')
  const market = join(profileDir, RECEIPT_DIRECTORY)
  if (create) {
    mkdirSync(root, { recursive: true })
    if (lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory()) {
      throw new Error('DeepRunner Profile state directory is invalid')
    }
    mkdirSync(market, { recursive: true })
  }
  const stat = lstatSync(market)
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error('DeepRunner Market state directory is invalid')
  }
  return market
}

function receiptPath(profileDir: string, create = false): string {
  return join(privateDirectory(profileDir, create), RECEIPT_FILENAME)
}

function statePath(profileDir: string, create = false): string {
  return join(privateDirectory(profileDir, create), STATE_FILENAME)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validRuntime(value: unknown): value is DeepRunnerRuntimeIdentity {
  if (!isRecord(value)) return false
  return ['deepRunnerVersion', 'dshVersion', 'cordisVersion', 'nodeVersion', 'electronVersion', 'nodeModulesVersion', 'architecture']
    .every(key => typeof value[key] === 'string' && value[key].length > 0)
}

function validReceipt(value: unknown): value is DeepRunnerMarketInstallReceipt {
  if (!isRecord(value) || value.schemaVersion !== RECEIPT_SCHEMA_VERSION) return false
  return ['pluginId', 'profile', 'packageName', 'version', 'sourceId', 'catalogVersion', 'sourceRevision', 'distIntegrity', 'bundlePatch', 'installedAt']
    .every(key => typeof value[key] === 'string' && value[key].length > 0)
    && Array.isArray(value.buildScriptPackages)
    && value.buildScriptPackages.every(item => typeof item === 'string' && item.length > 0)
    && validRuntime(value.installedRuntime)
    && (value.sideloadedEntry === undefined || validSideloadedEntry(value.sideloadedEntry, value))
    && (value.sideloadSource === undefined || validSideloadSource(value.sideloadSource))
}

function validSideloadSource(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (value.kind === 'npm' || value.kind === 'github')
    && typeof value.normalizedSource === 'string'
    && value.normalizedSource.length > 0 && value.normalizedSource.length <= 2_048
    && !value.normalizedSource.includes('\0')
}

function validSideloadedEntry(value: unknown, receipt: Record<string, unknown>): value is DeepRunnerMarketEntry {
  if (!isRecord(value) || !isRecord(value.release)) return false
  return value.trustLevel === 'sideloaded'
    && value.packageName === receipt.packageName
    && value.release.version === receipt.version
    && typeof value.id === 'string' && value.id.length > 0
    && typeof value.displayName === 'string' && value.displayName.length > 0
    && typeof value.summary === 'string' && typeof value.description === 'string'
    && typeof value.publisher === 'string' && typeof value.license === 'string'
    && Array.isArray(value.tags)
    && value.status === 'listed'
    && value.release.exactSpec === `${String(receipt.packageName)}@${String(receipt.version)}`
    && value.release.distIntegrity === receipt.distIntegrity
    && Array.isArray(value.release.platforms) && Array.isArray(value.release.faces)
    && Array.isArray(value.release.capabilities)
}

export function readDeepRunnerMarketReceipts(profileDir: string): readonly DeepRunnerMarketInstallReceipt[] {
  try {
    const path = receiptPath(profileDir)
    if (statSync(path).size > MAX_RECEIPT_BYTES) return []
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!isRecord(value) || value.schemaVersion !== RECEIPT_SCHEMA_VERSION
      || !Array.isArray(value.receipts) || value.receipts.length > 1_000
      || !value.receipts.every(validReceipt)) return []
    return structuredClone(value.receipts)
  } catch {
    return []
  }
}

function writeReceipts(profileDir: string, receipts: readonly DeepRunnerMarketInstallReceipt[]): void {
  const path = receiptPath(profileDir, true)
  writeAtomicJson(path, { schemaVersion: RECEIPT_SCHEMA_VERSION, receipts } satisfies ReceiptFile)
}

function writeAtomicJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    renameSync(temporary, path)
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary)
  }
}

export function readDisabledDeepRunnerPlugins(profileDir: string): ReadonlySet<string> {
  try {
    const path = statePath(profileDir)
    if (statSync(path).size > MAX_RECEIPT_BYTES) return new Set()
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.disabled)
      || value.disabled.length > 1_000
      || value.disabled.some(item => typeof item !== 'string' || item.length === 0 || item.length > 214)) {
      return new Set()
    }
    return new Set(value.disabled as string[])
  } catch {
    return new Set()
  }
}

export function setDeepRunnerPluginDisabled(
  profileDir: string,
  packageName: string,
  disabled: boolean,
): void {
  const values = new Set(readDisabledDeepRunnerPlugins(profileDir))
  if (disabled) values.add(packageName)
  else values.delete(packageName)
  const state: PluginStateFile = { schemaVersion: 1, disabled: [...values].sort() }
  writeAtomicJson(statePath(profileDir, true), state)
}

export function saveDeepRunnerMarketReceipt(
  profileDir: string,
  receipt: DeepRunnerMarketInstallReceipt,
): void {
  const retained = readDeepRunnerMarketReceipts(profileDir)
    .filter(item => item.packageName !== receipt.packageName)
  writeReceipts(profileDir, [...retained, receipt])
}

export function removeDeepRunnerMarketReceipt(profileDir: string, packageName: string): void {
  const current = readDeepRunnerMarketReceipts(profileDir)
  const retained = current.filter(item => item.packageName !== packageName)
  if (retained.length !== current.length) writeReceipts(profileDir, retained)
}

function readManifest(packageDir: string): Record<string, unknown> {
  const path = join(packageDir, 'package.json')
  if (statSync(path).size > MAX_MANIFEST_BYTES) throw new Error('Installed plugin manifest is too large')
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!isRecord(value)) throw new Error('Installed plugin manifest is invalid')
  return value
}

function packageDirectory(profileDir: string, packageName: string): string {
  const modules = realpathSync(join(profileDir, 'node_modules'))
  const packageDir = realpathSync(join(modules, packageName))
  const relation = relative(modules, packageDir)
  if (relation === '' || relation === '..' || relation.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    throw new Error('Installed plugin resolves outside the Profile node_modules directory')
  }
  return packageDir
}

function bundlePatch(manifest: Record<string, unknown>, packageDir: string): string {
  const dsh = isRecord(manifest.dsh) ? manifest.dsh : undefined
  const bundle = dsh !== undefined && isRecord(dsh.bundle) ? dsh.bundle : undefined
  const patch = bundle?.patch
  if (typeof patch !== 'string' || patch.length === 0 || patch.includes('\0')) {
    throw new Error('Installed plugin does not declare dsh.bundle.patch')
  }
  const root = realpathSync(packageDir)
  const patchPath = realpathSync(resolve(root, patch))
  const relation = relative(root, patchPath)
  if (relation === '..' || relation.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    throw new Error('Installed plugin bundle patch resolves outside its package')
  }
  return patch
}

function dependencyRanges(manifest: Record<string, unknown>): Map<string, string> {
  const ranges = new Map<string, string>()
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    const values = manifest[field]
    if (!isRecord(values)) continue
    for (const [name, range] of Object.entries(values)) {
      if (typeof range === 'string') ranges.set(name, range)
    }
  }
  return ranges
}

function manifestCompatibility(
  manifest: Record<string, unknown>,
  runtime: DeepRunnerRuntimeIdentity,
): string | undefined {
  const engines = isRecord(manifest.engines) ? manifest.engines : undefined
  if (typeof engines?.node === 'string' && !satisfies(runtime.nodeVersion, engines.node)) {
    return `Requires Node.js ${engines.node}; this app embeds ${runtime.nodeVersion}`
  }
  for (const [name, range] of dependencyRanges(manifest)) {
    const actual = name === '@deepseek-ai/cordis' || name === 'cordis'
      ? runtime.cordisVersion
      : name.startsWith('@deepseek-ai/dsh')
        ? runtime.dshVersion
        : undefined
    if (actual !== undefined && !satisfies(actual, range)) {
      return `Dependency ${name} requires ${range}; this app provides ${actual}`
    }
  }
  return undefined
}

function verifyLockfile(
  profileDir: string,
  packageName: string,
  version: string,
  expectedIntegrity: string,
): void {
  const lockPath = join(profileDir, 'pnpm-lock.yaml')
  if (statSync(lockPath).size > MAX_LOCKFILE_BYTES) throw new Error('Profile lockfile is too large')
  const value: unknown = parseYaml(readFileSync(lockPath, 'utf8'))
  if (!isRecord(value) || !isRecord(value.importers) || !isRecord(value.importers['.'])) {
    throw new Error('Profile lockfile has no root importer')
  }
  const importer = value.importers['.']
  const dependencies = isRecord(importer.dependencies) ? importer.dependencies : undefined
  const dependency = dependencies !== undefined && isRecord(dependencies[packageName])
    ? dependencies[packageName]
    : undefined
  if (dependency?.specifier !== version
    || typeof dependency.version !== 'string'
    || (dependency.version !== version && !dependency.version.startsWith(`${version}(`))) {
    throw new Error('Profile lockfile does not pin the selected plugin version')
  }
  const packages = isRecord(value.packages) ? value.packages : undefined
  const lockedValue: unknown = packages?.[`${packageName}@${version}`]
  const locked = isRecord(lockedValue) ? lockedValue : undefined
  const resolutionValue: unknown = locked?.resolution
  const resolution = isRecord(resolutionValue) ? resolutionValue : undefined
  if (resolution?.integrity !== expectedIntegrity) {
    throw new Error('Installed plugin integrity does not match the Profile lockfile')
  }
}

function hasKnownNativeDependency(manifest: Record<string, unknown>): boolean {
  for (const name of dependencyRanges(manifest).keys()) {
    if (NATIVE_DEPENDENCIES.has(name)) return true
  }
  return false
}

export function auditDeepRunnerInstalledPlugin(
  profileDir: string,
  packageName: string,
  runtime: DeepRunnerRuntimeIdentity,
): DeepRunnerInstalledPluginAudit {
  try {
    const dir = packageDirectory(profileDir, packageName)
    const manifest = readManifest(dir)
    const version = manifest.version
    if (manifest.name !== packageName || typeof version !== 'string' || semver.valid(version) === null) {
      return { compatible: false, managed: false, reason: 'Installed plugin identity is invalid' }
    }
    bundlePatch(manifest, dir)
    const reason = manifestCompatibility(manifest, runtime)
    const receipt = readDeepRunnerMarketReceipts(profileDir)
      .find(item => item.packageName === packageName && item.version === version)
    if (reason !== undefined) return { compatible: false, managed: receipt !== undefined, reason, version, ...(receipt === undefined ? {} : { receipt }) }
    if (receipt !== undefined && receipt.buildScriptPackages.length > 0
      && (receipt.installedRuntime.nodeModulesVersion !== runtime.nodeModulesVersion
        || receipt.installedRuntime.architecture !== runtime.architecture)) {
      return {
        compatible: false,
        managed: true,
        reason: `Native dependencies were built for ABI ${receipt.installedRuntime.nodeModulesVersion}/${receipt.installedRuntime.architecture}; this app requires ABI ${runtime.nodeModulesVersion}/${runtime.architecture}. Remove and reinstall the plugin.`,
        version,
        receipt,
      }
    }
    if (receipt === undefined && hasKnownNativeDependency(manifest)) {
      return {
        compatible: false,
        managed: false,
        reason: 'Native dependency provenance is unknown. Remove the plugin, then install it again from Market.',
        version,
      }
    }
    return { compatible: true, managed: receipt !== undefined, version, ...(receipt === undefined ? {} : { receipt }) }
  } catch (cause) {
    return {
      compatible: false,
      managed: false,
      reason: cause instanceof Error ? cause.message : String(cause),
    }
  }
}

export function createDeepRunnerMarketReceipt(
  profileDir: string,
  profile: string,
  entry: DeepRunnerMarketEntry,
  source: { readonly sourceId: string; readonly catalogVersion: string },
  runtime: DeepRunnerRuntimeIdentity,
  installedAt: string,
  sideloadSource?: { readonly kind: 'npm' | 'github'; readonly normalizedSource: string },
): DeepRunnerMarketInstallReceipt {
  const dir = packageDirectory(profileDir, entry.packageName)
  const manifest = readManifest(dir)
  if (manifest.name !== entry.packageName || manifest.version !== entry.release.version) {
    throw new Error('Installed plugin identity does not match the selected Market release')
  }
  const patch = bundlePatch(manifest, dir)
  const reason = manifestCompatibility(manifest, runtime)
  if (reason !== undefined) throw new Error(reason)
  const integrity = entry.release.distIntegrity
  if (integrity === undefined) throw new Error('Market release has no artifact integrity')
  verifyLockfile(profileDir, entry.packageName, entry.release.version, integrity)
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    pluginId: entry.id,
    profile,
    packageName: entry.packageName,
    version: entry.release.version,
    sourceId: source.sourceId,
    catalogVersion: source.catalogVersion,
    sourceRevision: entry.release.sourceRevision,
    distIntegrity: integrity,
    bundlePatch: patch,
    buildScriptPackages: [...(entry.release.buildScriptPackages ?? [])],
    installedAt,
    installedRuntime: structuredClone(runtime),
    ...(sideloadSource === undefined ? {} : {
      sideloadedEntry: structuredClone(entry),
      sideloadSource: structuredClone(sideloadSource),
    }),
  }
}
