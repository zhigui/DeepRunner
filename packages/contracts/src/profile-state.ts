import {
  parseDeepRunnerProfileName,
  type DeepRunnerProfileName,
} from './profile-name.js'

export const DEEPRUNNER_PROFILE_STATE_VERSION = 1 as const

/** Launcher-private selection state persisted outside the DSH profile tree. */
export interface DeepRunnerProfileStateV1 {
  readonly version: typeof DEEPRUNNER_PROFILE_STATE_VERSION
  readonly active: DeepRunnerProfileName
  readonly pending?: DeepRunnerProfileName
  readonly lastKnownGood: DeepRunnerProfileName
}

/** Create the safe initial state used when no private selection exists. */
export function initialDeepRunnerProfileState(
  name: string = 'deeprunner',
): DeepRunnerProfileStateV1 {
  const profileName = parseDeepRunnerProfileName(name)
  return {
    version: DEEPRUNNER_PROFILE_STATE_VERSION,
    active: profileName,
    lastKnownGood: profileName,
  }
}

/** Parse persisted JSON data without accepting unknown versions or malformed names. */
export function parseDeepRunnerProfileState(value: unknown): DeepRunnerProfileStateV1 {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('DeepRunner profile selection state must be an object')
  }
  const state = value as Record<string, unknown>
  if (state.version !== DEEPRUNNER_PROFILE_STATE_VERSION) {
    throw new Error(`unsupported DeepRunner profile selection state version ${String(state.version)}`)
  }
  const active = parseDeepRunnerProfileName(state.active)
  const lastKnownGood = parseDeepRunnerProfileName(state.lastKnownGood)
  const pending = state.pending === undefined
    ? undefined
    : parseDeepRunnerProfileName(state.pending)
  return {
    version: DEEPRUNNER_PROFILE_STATE_VERSION,
    active,
    ...(pending === undefined ? {} : { pending }),
    lastKnownGood,
  }
}

