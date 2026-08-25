import { randomUUID } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import {
  PROFILE_TEMPLATES,
  readProfileManifest,
  resolveProfileDir,
} from '@deepseek-ai/dsh-app-boot'
import {
  DEEPRUNNER_PROFILE_STATE_VERSION,
  initialDeepRunnerProfileState,
  parseDeepRunnerProfileName,
  parseDeepRunnerProfileState,
  type DeepRunnerProfileName,
  type DeepRunnerProfileStateV1,
  type DeepRunnerProfileSummary,
} from '@deeprunner/contracts'

const BIN_NAME = 'deeprunner'
const DEFAULT_PROFILE = 'deeprunner'
const WEB_PROFILE = 'web'
const BASE_BUNDLE = '@deepseek-ai/dsh-base'
const WEB_BUNDLE = '@deepseek-ai/dsh-web-app'
const DESKTOP_BUNDLE = '@deeprunner/desktop-plugin'
const MARKET_BUNDLE = '@deeprunner/plugin-market'
const MAX_STATE_BYTES = 4 * 1024
const PRIVATE_DIRECTORY_MODE = 0o700
const PRIVATE_FILE_MODE = 0o600

export interface DeepRunnerProfileStartup {
  readonly profileName: DeepRunnerProfileName
  readonly state: DeepRunnerProfileStateV1
  readonly recoveredState: boolean
  readonly rolledBackFrom?: DeepRunnerProfileName
}

interface LoadedState {
  readonly state: DeepRunnerProfileStateV1
  readonly recovered: boolean
}

class InvalidProfileStateError extends Error {}

function manifestBundles(manifest: ReturnType<typeof readProfileManifest>): string[] {
  const value = manifest.dsh?.profile?.bundles
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some(bundle => typeof bundle !== 'string')) {
    throw new Error('dsh.profile.bundles must be an array of package names')
  }
  return [...value]
}

function existingProfile(
  homeDir: string,
  name: DeepRunnerProfileName,
  platform: NodeJS.Platform,
): DeepRunnerProfileSummary {
  const dir = resolveProfileDir(name, homeDir)
  try {
    const bundles = manifestBundles(readProfileManifest(BIN_NAME, dir))
    const launcherOwnedBundle = name !== DEFAULT_PROFILE
      ? [DESKTOP_BUNDLE, MARKET_BUNDLE].find(bundle => bundles.includes(bundle))
      : undefined
    const baseIndex = bundles.indexOf(BASE_BUNDLE)
    const webIndex = bundles.indexOf(WEB_BUNDLE)
    const supportsWeb = launcherOwnedBundle === undefined && (
      name === DEFAULT_PROFILE || (baseIndex !== -1 && webIndex > baseIndex)
    )
    const reason = launcherOwnedBundle !== undefined
      ? `${launcherOwnedBundle} is launcher-owned and must not appear in profile bundles`
      : supportsWeb
        ? undefined
        : `profile must include ${BASE_BUNDLE} before ${WEB_BUNDLE}`
    return {
      name,
      dir,
      exists: true,
      bundles,
      selectable: reason === undefined,
      supportsWeb,
      supportsAdvancedMode: supportsWeb && platform !== 'linux',
      ...(reason === undefined ? {} : { reason }),
    }
  } catch (cause) {
    return {
      name,
      dir,
      exists: true,
      bundles: [],
      selectable: false,
      supportsWeb: false,
      supportsAdvancedMode: false,
      reason: cause instanceof Error ? cause.message : String(cause),
    }
  }
}

function virtualWebProfile(
  homeDir: string,
  name: DeepRunnerProfileName,
  platform: NodeJS.Platform,
): DeepRunnerProfileSummary {
  const bundles = PROFILE_TEMPLATES.web
  if (bundles === undefined) throw new Error('installed dsh-app-boot has no Web profile template')
  return {
    name,
    dir: resolveProfileDir(name, homeDir),
    exists: false,
    bundles: [...bundles],
    selectable: true,
    supportsWeb: true,
    supportsAdvancedMode: platform !== 'linux',
  }
}

function profilePriority(name: string): number {
  return name === DEFAULT_PROFILE ? 0 : name === WEB_PROFILE ? 1 : 2
}

/** Discover profiles without initializing or modifying the DSH profile tree. */
export function listDeepRunnerProfiles(
  homeDir: string,
  platform: NodeJS.Platform = process.platform,
): DeepRunnerProfileSummary[] {
  const summaries = new Map<DeepRunnerProfileName, DeepRunnerProfileSummary>()
  try {
    for (const entry of readdirSync(join(homeDir, 'profiles'), { withFileTypes: true })) {
      if (entry.name === 'node_modules' || (!entry.isDirectory() && !entry.isSymbolicLink())) continue
      let name: DeepRunnerProfileName
      try {
        name = parseDeepRunnerProfileName(entry.name)
      } catch {
        continue
      }
      const dir = resolveProfileDir(name, homeDir)
      if (!existsSync(join(dir, 'package.json'))) continue
      summaries.set(name, existingProfile(homeDir, name, platform))
    }
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause
  }

  for (const candidate of [DEFAULT_PROFILE, WEB_PROFILE]) {
    const name = parseDeepRunnerProfileName(candidate)
    if (!summaries.has(name)) summaries.set(name, virtualWebProfile(homeDir, name, platform))
  }
  return [...summaries.values()].sort((left, right) => {
    const priority = profilePriority(left.name) - profilePriority(right.name)
    return priority !== 0 ? priority : left.name.localeCompare(right.name)
  })
}

function selectableProfile(homeDir: string, name: string): DeepRunnerProfileSummary {
  const parsed = parseDeepRunnerProfileName(name)
  const summary = listDeepRunnerProfiles(homeDir).find(profile => profile.name === parsed)
  if (summary === undefined) throw new Error(`DeepRunner profile ${JSON.stringify(name)} does not exist`)
  if (!summary.selectable) {
    throw new Error(`DeepRunner profile ${JSON.stringify(name)} cannot be selected: ${summary.reason ?? 'incompatible'}`)
  }
  return summary
}

function readStateText(statePath: string): string {
  const descriptor = openSync(statePath, 'r')
  try {
    if (fstatSync(descriptor).size > MAX_STATE_BYTES) {
      throw new InvalidProfileStateError(`profile state exceeds ${MAX_STATE_BYTES} bytes`)
    }
    return readFileSync(descriptor, 'utf8')
  } finally {
    closeSync(descriptor)
  }
}

function loadState(statePath: string): LoadedState {
  let text: string
  try {
    if (lstatSync(statePath).isSymbolicLink()) {
      return { state: initialDeepRunnerProfileState(), recovered: true }
    }
    text = readStateText(statePath)
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
      return { state: initialDeepRunnerProfileState(), recovered: false }
    }
    if (cause instanceof InvalidProfileStateError) {
      return { state: initialDeepRunnerProfileState(), recovered: true }
    }
    throw cause
  }
  try {
    return { state: parseDeepRunnerProfileState(JSON.parse(text) as unknown), recovered: false }
  } catch {
    return { state: initialDeepRunnerProfileState(), recovered: true }
  }
}

function unlinkTemporary(path: string): void {
  try {
    unlinkSync(path)
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause
  }
}

/** Atomically replace the launcher-private state without following a target symlink. */
function writeState(statePath: string, state: DeepRunnerProfileStateV1): void {
  const stateDir = dirname(statePath)
  mkdirSync(stateDir, { recursive: true, mode: PRIVATE_DIRECTORY_MODE })
  const directoryStat = lstatSync(stateDir)
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error(`DeepRunner profile state directory is not private: ${stateDir}`)
  }
  chmodSync(stateDir, PRIVATE_DIRECTORY_MODE)
  const temporary = join(stateDir, `.${basename(statePath)}.${process.pid}.${randomUUID()}.tmp`)
  try {
    writeFileSync(temporary, `${JSON.stringify(state, undefined, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: PRIVATE_FILE_MODE,
    })
    chmodSync(temporary, PRIVATE_FILE_MODE)
    renameSync(temporary, statePath)
  } finally {
    unlinkTemporary(temporary)
  }
}

export function readDeepRunnerProfileState(statePath: string): DeepRunnerProfileStateV1 {
  return loadState(statePath).state
}

/** Replace selection state with one explicit launcher-owned recovery target. */
export function resetDeepRunnerProfileSelection(
  statePath: string,
  homeDir: string,
  name: string = DEFAULT_PROFILE,
): DeepRunnerProfileStateV1 {
  const target = selectableProfile(homeDir, name).name
  const next: DeepRunnerProfileStateV1 = {
    version: DEEPRUNNER_PROFILE_STATE_VERSION,
    active: target,
    lastKnownGood: target,
  }
  writeState(statePath, next)
  return next
}

/** Validate and persist a pending target for the next generation. */
export function selectDeepRunnerProfile(
  statePath: string,
  homeDir: string,
  name: string,
): DeepRunnerProfileStateV1 {
  const target = selectableProfile(homeDir, name).name
  const current = loadState(statePath).state
  const next: DeepRunnerProfileStateV1 = current.active === target && current.lastKnownGood === target
    ? { version: DEEPRUNNER_PROFILE_STATE_VERSION, active: target, lastKnownGood: target }
    : {
        version: DEEPRUNNER_PROFILE_STATE_VERSION,
        active: current.active,
        pending: target,
        lastKnownGood: current.lastKnownGood,
      }
  writeState(statePath, next)
  return next
}

function isSelectable(homeDir: string, name: DeepRunnerProfileName): boolean {
  try {
    selectableProfile(homeDir, name)
    return true
  } catch {
    return false
  }
}

/** Consume pending selection or roll an unconfirmed generation back before boot. */
export function beginDeepRunnerProfileStartup(
  statePath: string,
  homeDir: string,
): DeepRunnerProfileStartup {
  const loaded = loadState(statePath)
  const current = loaded.state
  let profileName = current.active
  let recoveredState = loaded.recovered
  let rolledBackFrom: DeepRunnerProfileName | undefined

  if (current.pending !== undefined) {
    if (isSelectable(homeDir, current.pending)) profileName = current.pending
    else {
      rolledBackFrom = current.pending
      profileName = isSelectable(homeDir, current.lastKnownGood)
        ? current.lastKnownGood
        : parseDeepRunnerProfileName(DEFAULT_PROFILE)
      recoveredState = true
    }
  } else if (current.active !== current.lastKnownGood) {
    rolledBackFrom = current.active
    profileName = isSelectable(homeDir, current.lastKnownGood)
      ? current.lastKnownGood
      : parseDeepRunnerProfileName(DEFAULT_PROFILE)
    recoveredState = true
  } else if (!isSelectable(homeDir, current.active)) {
    rolledBackFrom = current.active
    profileName = parseDeepRunnerProfileName(DEFAULT_PROFILE)
    recoveredState = true
  }

  const lastKnownGood = isSelectable(homeDir, current.lastKnownGood)
    ? current.lastKnownGood
    : parseDeepRunnerProfileName(DEFAULT_PROFILE)
  const state: DeepRunnerProfileStateV1 = {
    version: DEEPRUNNER_PROFILE_STATE_VERSION,
    active: profileName,
    lastKnownGood,
  }
  writeState(statePath, state)
  return {
    profileName,
    state,
    recoveredState,
    ...(rolledBackFrom === undefined ? {} : { rolledBackFrom }),
  }
}

/** Promote the mounted generation to last-known-good. */
export function markDeepRunnerProfileHealthy(
  statePath: string,
  name: string,
): DeepRunnerProfileStateV1 {
  const profileName = parseDeepRunnerProfileName(name)
  const current = loadState(statePath).state
  if (current.active !== profileName || current.pending !== undefined) {
    throw new Error(`cannot confirm inactive DeepRunner profile ${JSON.stringify(name)}`)
  }
  const next: DeepRunnerProfileStateV1 = {
    version: DEEPRUNNER_PROFILE_STATE_VERSION,
    active: profileName,
    lastKnownGood: profileName,
  }
  writeState(statePath, next)
  return next
}
