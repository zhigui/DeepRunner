import {
  chmodSync,
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import type {
  DeepRunnerProfileName,
  DeepRunnerProfileSummary,
} from '@deeprunner/contracts'
import {
  listDeepRunnerProfiles,
  readDeepRunnerProfileState,
  resetDeepRunnerProfileSelection,
} from './profile-manager.js'

const DEFAULT_PROFILE = 'deeprunner'
const SAFE_MODE_CONTENT = 'deeprunner-safe-mode-v1\n'
const PRIVATE_DIRECTORY_MODE = 0o700
const PRIVATE_FILE_MODE = 0o600
const MAX_ERROR_LENGTH = 2_000

export interface DeepRunnerProfilePaths {
  readonly statePath: string
  readonly safeModePath: string
}

export interface DeepRunnerRecoveryModel {
  readonly failedProfile: DeepRunnerProfileName
  readonly lastKnownGood: DeepRunnerProfileName
  readonly error: string
  readonly profiles: readonly DeepRunnerProfileSummary[]
}

export type DeepRunnerBootRecoveryPlan =
  | {
      readonly kind: 'automatic-rollback'
      readonly failedProfile: DeepRunnerProfileName
      readonly targetProfile: DeepRunnerProfileName
    }
  | { readonly kind: 'recovery-window'; readonly model: DeepRunnerRecoveryModel }

/** Launcher-private Profile state paths under Electron userData. */
export function deepRunnerProfilePaths(userDataDir: string): DeepRunnerProfilePaths {
  const directory = join(userDataDir, 'profile-selection')
  return {
    statePath: join(directory, 'state.json'),
    safeModePath: join(directory, 'safe-mode.once'),
  }
}

function errorMessage(cause: unknown): string {
  const value = cause instanceof Error ? cause.message : String(cause)
  return value.slice(0, MAX_ERROR_LENGTH) || 'Unknown startup failure'
}

/** Decide whether a failed generation can roll back without user input. */
export function planDeepRunnerBootRecovery(
  statePath: string,
  homeDir: string,
  cause: unknown,
  platform: NodeJS.Platform = process.platform,
): DeepRunnerBootRecoveryPlan {
  const state = readDeepRunnerProfileState(statePath)
  const profiles = listDeepRunnerProfiles(homeDir, platform)
  const fallback = profiles.find(profile => profile.name === state.lastKnownGood)
  if (state.active !== state.lastKnownGood && fallback?.selectable === true) {
    return {
      kind: 'automatic-rollback',
      failedProfile: state.active,
      targetProfile: state.lastKnownGood,
    }
  }
  return {
    kind: 'recovery-window',
    model: {
      failedProfile: state.active,
      lastKnownGood: state.lastKnownGood,
      error: errorMessage(cause),
      profiles,
    },
  }
}

/** Persist a one-shot safe-mode request without following a symlink target. */
export function requestDeepRunnerSafeMode(
  safeModePath: string,
  statePath: string,
  homeDir: string,
): void {
  resetDeepRunnerProfileSelection(statePath, homeDir, DEFAULT_PROFILE)
  const directory = dirname(safeModePath)
  mkdirSync(directory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE })
  const stat = lstatSync(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`DeepRunner safe-mode directory is not private: ${directory}`)
  }
  chmodSync(directory, PRIVATE_DIRECTORY_MODE)
  try {
    unlinkSync(safeModePath)
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause
  }
  writeFileSync(safeModePath, SAFE_MODE_CONTENT, {
    encoding: 'utf8',
    flag: 'wx',
    mode: PRIVATE_FILE_MODE,
  })
  chmodSync(safeModePath, PRIVATE_FILE_MODE)
}

/** Consume a valid one-shot safe-mode request before Profile preparation. */
export function consumeDeepRunnerSafeMode(safeModePath: string): boolean {
  let stat: ReturnType<typeof lstatSync>
  try {
    stat = lstatSync(safeModePath)
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw cause
  }
  let valid = false
  try {
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > SAFE_MODE_CONTENT.length) return false
    const descriptor = openSync(safeModePath, 'r')
    try {
      valid = readFileSync(descriptor, 'utf8') === SAFE_MODE_CONTENT
    } finally {
      closeSync(descriptor)
    }
    return valid
  } finally {
    try {
      unlinkSync(safeModePath)
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause
    }
  }
}
