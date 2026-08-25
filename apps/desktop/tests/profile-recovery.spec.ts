import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  beginDeepRunnerProfileStartup,
  readDeepRunnerProfileState,
  selectDeepRunnerProfile,
} from '../src/profile-manager.js'
import {
  consumeDeepRunnerSafeMode,
  deepRunnerProfilePaths,
  planDeepRunnerBootRecovery,
  requestDeepRunnerSafeMode,
} from '../src/profile-recovery.js'

function fixture(): { homeDir: string; statePath: string; safeModePath: string } {
  const root = mkdtempSync(join(tmpdir(), 'deeprunner-recovery-'))
  const homeDir = join(root, 'dsh-home')
  return { homeDir, ...deepRunnerProfilePaths(join(root, 'user-data')) }
}

function writeProfile(homeDir: string, name: string): void {
  const directory = join(homeDir, 'profiles', name)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'package.json'), JSON.stringify({
    name: `fixture-${name}`,
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
  }), 'utf8')
}

describe('DeepRunner Profile recovery', () => {
  it('automatically rolls a failed pending Profile back to last-known-good', () => {
    const { homeDir, statePath } = fixture()
    writeProfile(homeDir, 'team')
    selectDeepRunnerProfile(statePath, homeDir, 'team')
    beginDeepRunnerProfileStartup(statePath, homeDir)
    expect(planDeepRunnerBootRecovery(statePath, homeDir, new Error('plugin failed'), 'darwin'))
      .toEqual({
        kind: 'automatic-rollback',
        failedProfile: 'team',
        targetProfile: 'deeprunner',
      })
  })

  it('opens recovery when last-known-good itself fails', () => {
    const { homeDir, statePath } = fixture()
    beginDeepRunnerProfileStartup(statePath, homeDir)
    const plan = planDeepRunnerBootRecovery(statePath, homeDir, new Error('host failed'), 'darwin')
    expect(plan).toMatchObject({
      kind: 'recovery-window',
      model: { failedProfile: 'deeprunner', lastKnownGood: 'deeprunner', error: 'host failed' },
    })
  })

  it('persists and consumes safe mode exactly once while resetting selection', () => {
    const { homeDir, statePath, safeModePath } = fixture()
    writeProfile(homeDir, 'team')
    selectDeepRunnerProfile(statePath, homeDir, 'team')
    beginDeepRunnerProfileStartup(statePath, homeDir)
    requestDeepRunnerSafeMode(safeModePath, statePath, homeDir)
    expect(readDeepRunnerProfileState(statePath)).toEqual({
      version: 1,
      active: 'deeprunner',
      lastKnownGood: 'deeprunner',
    })
    expect(consumeDeepRunnerSafeMode(safeModePath)).toBe(true)
    expect(consumeDeepRunnerSafeMode(safeModePath)).toBe(false)
  })

  it('deletes a malformed safe-mode marker without enabling it', () => {
    const { safeModePath } = fixture()
    mkdirSync(join(safeModePath, '..'), { recursive: true })
    writeFileSync(safeModePath, 'invalid', 'utf8')
    expect(consumeDeepRunnerSafeMode(safeModePath)).toBe(false)
    expect(existsSync(safeModePath)).toBe(false)
  })
})
