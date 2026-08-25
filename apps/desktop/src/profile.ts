import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'
import type { Loader } from '@deepseek-ai/cordis-plugin-loader'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import {
  composeEntries,
  healProfilesModuleFallback,
  initProfile,
  loadOptionalPatches,
  loadOverlayPatches,
  loadProfile,
  PROFILE_PATCH_FILENAME,
  PROFILE_TEMPLATES,
  readProfileManifest,
  resolveBundleDir,
  resolveProfileDir,
  writeProfileManifest,
  type Profile,
} from '@deepseek-ai/dsh-app-boot'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { parseDeepRunnerProfileName, type DeepRunnerProfileName } from '@deeprunner/contracts'
import type { DeepRunnerRuntimeIdentity } from '@deeprunner/contracts/internal/runtime'
import {
  auditDeepRunnerInstalledPlugin,
  defaultDeepRunnerRuntimeIdentity,
  readDisabledDeepRunnerPlugins,
} from '@deeprunner/plugin-market'
import { packagedDependencyPath, unpackedAsarPath } from './packaged-runtime-path.js'

export const DEEPRUNNER_PROFILE_NAME = parseDeepRunnerProfileName('deeprunner')
export const DEEPRUNNER_PROFILE_ROOT = 'deeprunner.cordis.yml'

const BIN_NAME = 'deeprunner'
const BASE_BUNDLE = '@deepseek-ai/dsh-base'
const WEB_BUNDLE = '@deepseek-ai/dsh-web-app'
const DESKTOP_PACKAGE = '@deeprunner/desktop-plugin'
const MARKET_PACKAGE = '@deeprunner/plugin-market'
const SAFE_PROFILE_DIRECTORY = '.deeprunner-safe-mode'
const REQUIRED_WEB_BUNDLES = [...(PROFILE_TEMPLATES.web ?? [])]
const REQUIRED_WEB_BUNDLE_SET = new Set(REQUIRED_WEB_BUNDLES)
// The application package is the root of the production dependency closure,
// not an installed dependency of itself, so resolve it by location rather
// than package self-reference (which is unavailable without an exports map).
const DESKTOP_INSTALL_ANCHOR = unpackedAsarPath(fileURLToPath(new URL('../package.json', import.meta.url)))
const DSH_INSTALL_ANCHOR = packagedDependencyPath(import.meta.url, '@deepseek-ai/dsh/package.json')
const DSH_INSTALL_DIR = dirname(DSH_INSTALL_ANCHOR)
const DSH_AGENT_PRESETS_DIR = join(DSH_INSTALL_DIR, 'config', 'agent-presets')
const DESKTOP_PACKAGE_DIR = dirname(packagedDependencyPath(
  import.meta.url,
  `${DESKTOP_PACKAGE}/package.json`,
))
const DESKTOP_PATCH_PATH = join(DESKTOP_PACKAGE_DIR, 'cordis.patch.yml')
const MARKET_PACKAGE_DIR = dirname(packagedDependencyPath(
  import.meta.url,
  `${MARKET_PACKAGE}/package.json`,
))
const MARKET_PATCH_PATH = join(MARKET_PACKAGE_DIR, 'cordis.patch.yml')

if (REQUIRED_WEB_BUNDLES.length === 0
  || REQUIRED_WEB_BUNDLES[0] !== BASE_BUNDLE
  || !REQUIRED_WEB_BUNDLE_SET.has(WEB_BUNDLE)) {
  throw new Error('DeepRunner requires the official DSH Web profile template')
}

export interface PreparedDeepRunnerProfile {
  readonly homeDir: string
  readonly profile: Profile
  readonly rootConfig: string
  readonly patches: PatchOptions[]
  readonly bareModuleBaseUrl: string
  readonly skippedPlugins: readonly {
    readonly packageName: string
    readonly reason: string
  }[]
}

export interface PrepareDeepRunnerProfileOptions {
  /** Ignore user/third-party layers while retaining the official Web shell. */
  readonly safeMode?: boolean
  readonly runtime?: DeepRunnerRuntimeIdentity
}

/** Import one module through a package/config anchor without changing its identity. */
export async function importDeepRunnerModuleFrom(
  specifier: string,
  parentUrl: string,
): Promise<unknown> {
  if (specifier.startsWith('node:') || specifier.startsWith('file:')) return import(specifier)
  const resolved = createRequire(parentUrl).resolve(specifier)
  return import(pathToFileURL(resolved).href)
}

/** Supply Electron's missing internal Loader import face during Profile boot. */
export function installDeepRunnerLoaderImportFallback(
  loader: Loader,
): () => void {
  if (loader.internal !== undefined) return () => {}
  const fallback = {
    import: importDeepRunnerModuleFrom,
  } as unknown as NonNullable<Loader['internal']>
  loader.internal = fallback
  return () => {
    if (loader.internal === fallback) loader.internal = undefined
  }
}

/** Keep the official Web prefix while preserving every third-party bundle in order. */
export function deepRunnerBundleList(current: readonly string[]): string[] {
  const thirdParty = current.filter(name => !REQUIRED_WEB_BUNDLE_SET.has(name)
    && name !== DESKTOP_PACKAGE
    && name !== MARKET_PACKAGE)
  return [...REQUIRED_WEB_BUNDLES, ...thirdParty]
}

/** Load only installation-owned Web layers without touching user declarations. */
function loadSafeDeepRunnerProfile(profileName: DeepRunnerProfileName, profileDir: string): Profile {
  const layers: Profile['layers'] = REQUIRED_WEB_BUNDLES.map(packageName => {
    const packageDir = resolveBundleDir(BIN_NAME, packageName, DESKTOP_INSTALL_ANCHOR, profileDir)
    const manifest: unknown = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
    const patch = manifest !== null && typeof manifest === 'object'
      ? (manifest as { dsh?: { bundle?: { patch?: unknown } } }).dsh?.bundle?.patch
      : undefined
    if (typeof patch !== 'string' || patch.length === 0) {
      throw new Error(`DeepRunner safe-mode bundle ${JSON.stringify(packageName)} declares no patch`)
    }
    const patchPath = join(packageDir, patch)
    return {
      packageName,
      packageDir,
      patchPath,
      patches: loadOverlayPatches(BIN_NAME, patchPath),
    }
  })
  return {
    name: profileName,
    dir: profileDir,
    layers,
    patchPath: join(profileDir, PROFILE_PATCH_FILENAME),
    patches: [],
  }
}

/** Repair a launcher-owned hidden anchor that never reads a user manifest. */
function ensureSafeDeepRunnerProfile(homeDir: string): string {
  const profileDir = join(homeDir, 'profiles', SAFE_PROFILE_DIRECTORY)
  mkdirSync(profileDir, { recursive: true })
  const stat = lstatSync(profileDir)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`DeepRunner safe-mode Profile directory is invalid: ${profileDir}`)
  }
  writeProfileManifest(profileDir, {
    name: 'dsh-profile-deeprunner-safe-mode',
    dependencies: {},
    dsh: { profile: { bundles: [...REQUIRED_WEB_BUNDLES] } },
  })
  return profileDir
}

/** Initialize or repair only the installation-owned prefix of the default profile. */
export function ensureDeepRunnerProfile(
  homeDir: string,
  profileName: DeepRunnerProfileName = DEEPRUNNER_PROFILE_NAME,
): string {
  const profileDir = resolveProfileDir(profileName, homeDir)
  if (!existsSync(join(profileDir, 'package.json'))) {
    if (profileName !== DEEPRUNNER_PROFILE_NAME && profileName !== 'web') {
      throw new Error(`DeepRunner profile ${JSON.stringify(profileName)} does not exist`)
    }
    initProfile(profileDir, REQUIRED_WEB_BUNDLES)
  }
  if (profileName !== DEEPRUNNER_PROFILE_NAME) return profileDir
  const manifest = readProfileManifest(BIN_NAME, profileDir)
  const rawBundles = manifest.dsh?.profile?.bundles
  if (rawBundles !== undefined
    && (!Array.isArray(rawBundles) || rawBundles.some(value => typeof value !== 'string'))) {
    throw new Error('DeepRunner profile bundles must be an array of package names')
  }
  const current = rawBundles ?? []
  const bundles = deepRunnerBundleList(current)
  if (current.length !== bundles.length
    || current.some((value, index) => value !== bundles[index])) {
    writeProfileManifest(profileDir, {
      ...manifest,
      dsh: {
        ...manifest.dsh,
        profile: {
          ...manifest.dsh?.profile,
          bundles,
        },
      },
    })
  }
  return profileDir
}

/** Compose one immutable Web generation without editing upstream bundles. */
export function prepareDeepRunnerProfile(
  homeDir: string = resolveDshHome(),
  profileName: DeepRunnerProfileName = DEEPRUNNER_PROFILE_NAME,
  options: PrepareDeepRunnerProfileOptions = {},
): PreparedDeepRunnerProfile {
  const profileDir = options.safeMode === true
    ? ensureSafeDeepRunnerProfile(homeDir)
    : ensureDeepRunnerProfile(homeDir, profileName)
  // Build the profile fallback from the desktop application's complete
  // production closure. Using the nested DSH package as the anchor omits
  // DeepRunner-owned Host/Client packages from profiles/node_modules, so the
  // Client module registry silently excludes the desktop client bundle.
  healProfilesModuleFallback(DESKTOP_INSTALL_ANCHOR, homeDir)
  const profile = options.safeMode === true
    ? loadSafeDeepRunnerProfile(profileName, profileDir)
    : loadProfile(BIN_NAME, profileName, DESKTOP_INSTALL_ANCHOR, homeDir)
  const rootConfig = join(profileDir, DEEPRUNNER_PROFILE_ROOT)
  writeFileSync(rootConfig, '[]\n', 'utf8')

  const desktopPatches = loadOverlayPatches(BIN_NAME, DESKTOP_PATCH_PATH)
  const marketPatches = options.safeMode === true
    ? []
    : loadOverlayPatches(BIN_NAME, MARKET_PATCH_PATH)
  const patches: PatchOptions[] = []
  const skippedPlugins: Array<{ packageName: string; reason: string }> = []
  const runtime = options.runtime ?? defaultDeepRunnerRuntimeIdentity()
  const disabledPlugins = readDisabledDeepRunnerPlugins(profile.dir)
  let desktopInserted = false
  for (const layer of profile.layers) {
    if (options.safeMode === true && !REQUIRED_WEB_BUNDLE_SET.has(layer.packageName)) continue
    if (!REQUIRED_WEB_BUNDLE_SET.has(layer.packageName)) {
      if (disabledPlugins.has(layer.packageName)) {
        skippedPlugins.push({ packageName: layer.packageName, reason: 'Disabled by the user' })
        continue
      }
      const audit = auditDeepRunnerInstalledPlugin(profile.dir, layer.packageName, runtime)
      if (!audit.compatible) {
        skippedPlugins.push({
          packageName: layer.packageName,
          reason: audit.reason ?? 'Failed the DeepRunner compatibility audit',
        })
        continue
      }
    }
    patches.push(...layer.patches)
    if (layer.packageName === WEB_BUNDLE) {
      patches.push(...desktopPatches)
      patches.push(...marketPatches)
      desktopInserted = true
    }
  }
  if (!desktopInserted) throw new Error('DeepRunner profile is missing the official Web bundle')
  // The Web bundle supplies the deployment default (`standard`), but the
  // shipped preset root is an app assembly concern.  The CLI adds this root
  // from its own entrypoint; DeepRunner must do the same or every session
  // fails with `agent-preset-not-found` even though the presets are installed.
  patches.push({
    id: 'agent-presets',
    config: {
      default: 'standard',
      roots: [{ path: DSH_AGENT_PRESETS_DIR, trust: 'system' }],
    },
  })
  if (options.safeMode !== true) {
    patches.push(...profile.patches)
    patches.push(...(loadOptionalPatches(BIN_NAME, join(homeDir, PROFILE_PATCH_FILENAME)) ?? []))
  }

  const rows = new Map<string, EntryOptions>()
  for (const row of composeEntries([patches])) {
    if (typeof row.id === 'string') rows.set(row.id, row)
  }
  if (!rows.has('webserver')) throw new Error('DeepRunner profile has no webserver row')
  if (!rows.has('deeprunner-shell')) throw new Error('DeepRunner desktop shell patch did not compose')
  if (options.safeMode !== true && !rows.has('deeprunner-plugin-market')) {
    throw new Error('DeepRunner plugin market patch did not compose')
  }

  // Loopback binding is a launcher invariant and always wins over user patches.
  patches.push({
    id: 'webserver',
    disabled: false,
    config: { host: '127.0.0.1', port: 0 },
  })

  return {
    homeDir,
    profile,
    rootConfig,
    patches: structuredClone(patches),
    skippedPlugins: structuredClone(skippedPlugins),
    // Resolve every Loader entry from the profile-owned package anchor. Its
    // parent profiles/node_modules is healed from the complete desktop
    // application closure above, including both DSH and DeepRunner clients.
    bareModuleBaseUrl: pathToFileURL(join(profile.dir, 'package.json')).href,
  }
}
