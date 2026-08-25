import { describe, expect, it } from 'vitest'
import {
  initialDeepRunnerProfileState,
  isDeepRunnerProfileName,
  parseDeepRunnerProfileState,
} from '../src/index.js'

describe('DeepRunner profile names', () => {
  it.each(['deeprunner', 'team-1', 'profile.test', 'profile_test'])(
    'accepts %s',
    (name) => { expect(isDeepRunnerProfileName(name)).toBe(true) },
  )

  it.each(['', 'Team', '../escape', 'white space', 'a'.repeat(64)])(
    'rejects %s',
    (name) => { expect(isDeepRunnerProfileName(name)).toBe(false) },
  )

  it('round-trips the initial state through the untrusted parser', () => {
    const state = initialDeepRunnerProfileState()
    expect(parseDeepRunnerProfileState(JSON.parse(JSON.stringify(state)))).toEqual(state)
  })

  it('rejects unknown state versions', () => {
    expect(() => parseDeepRunnerProfileState({
      version: 2,
      active: 'deeprunner',
      lastKnownGood: 'deeprunner',
    })).toThrow(/unsupported/u)
  })
})

