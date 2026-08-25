const PROFILE_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62})$/u

declare const profileNameBrand: unique symbol

/** A profile name validated for use in DeepRunner state and DSH argv. */
export type DeepRunnerProfileName = string & {
  readonly [profileNameBrand]: true
}

/** Return whether an unknown value is a supported DeepRunner profile name. */
export function isDeepRunnerProfileName(value: unknown): value is DeepRunnerProfileName {
  return typeof value === 'string' && PROFILE_NAME_PATTERN.test(value)
}

/** Parse an untrusted profile name or fail before it crosses a path/process boundary. */
export function parseDeepRunnerProfileName(value: unknown): DeepRunnerProfileName {
  if (!isDeepRunnerProfileName(value)) {
    throw new Error('DeepRunner profile name must be 1-63 lowercase letters, digits, dots, underscores, or hyphens')
  }
  return value
}

