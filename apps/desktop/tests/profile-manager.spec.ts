import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  beginDeepRunnerProfileStartup,
  listDeepRunnerProfiles,
  markDeepRunnerProfileHealthy,
  readDeepRunnerProfileState,
  resetDeepRunnerProfileSelection,
  selectDeepRunnerProfile,
} from '../src/profile-manager.js'

function fixture(): { homeDir: string; statePath: string } {
  const root = mkdtempSync(join(tmpdir(), 'deeprunner-profile-'))
  return {
    homeDir: join(root, 'dsh-home'),
    statePath: join(root, 'user-data', 'profile-selection', 'state.json'),
  }
}

function writeProfile(homeDir: string, name: string, bundles: unknown): void {
  const dir = join(homeDir, 'profiles', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({
    name: `fixture-${name}`,
    dsh: { profile: { bundles } },
  }, undefined, 2)}\n`, 'utf8')
}

describe('DeepRunner Profile discovery', () => {
  it('exposes lazy product and Web defaults without creating profiles', () => {
    const { homeDir } = fixture()
    expect(listDeepRunnerProfiles(homeDir, 'darwin').map(profile => ({
      name: profile.name,
      exists: profile.exists,
      selectable: profile.selectable,
    }))).toEqual([
      { name: 'deeprunner', exists: false, selectable: true },
      { name: 'web', exists: false, selectable: true },
    ])
  })

  it('reports compatible and incompatible manifests without throwing', () => {
    const { homeDir } = fixture()
    writeProfile(homeDir, 'team', ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    writeProfile(homeDir, 'cli-only', ['@deepseek-ai/dsh-base'])
    writeProfile(homeDir, 'broken', 'not-an-array')
    const profiles = listDeepRunnerProfiles(homeDir, 'linux')
    expect(profiles.find(profile => profile.name === 'team')).toMatchObject({
      selectable: true,
      supportsWeb: true,
      supportsAdvancedMode: false,
    })
    expect(profiles.find(profile => profile.name === 'cli-only')).toMatchObject({
      selectable: false,
      supportsWeb: false,
    })
    expect(profiles.find(profile => profile.name === 'broken')?.reason).toMatch(/array/u)
  })

  it('rejects launcher-owned market bundles in a user Profile', () => {
    const { homeDir } = fixture()
    writeProfile(homeDir, 'market-owned', [
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      '@deeprunner/plugin-market',
    ])
    expect(listDeepRunnerProfiles(homeDir, 'darwin').find(profile => profile.name === 'market-owned')).toMatchObject({
      selectable: false,
      reason: expect.stringContaining('@deeprunner/plugin-market'),
    })
  })
})

describe('DeepRunner Profile selection state', () => {
  it('persists pending, consumes it for startup, then confirms health', () => {
    const { homeDir, statePath } = fixture()
    writeProfile(homeDir, 'team', ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    expect(selectDeepRunnerProfile(statePath, homeDir, 'team')).toMatchObject({
      active: 'deeprunner',
      pending: 'team',
      lastKnownGood: 'deeprunner',
    })
    const startup = beginDeepRunnerProfileStartup(statePath, homeDir)
    expect(startup.profileName).toBe('team')
    expect(startup.state).toEqual({ version: 1, active: 'team', lastKnownGood: 'deeprunner' })
    expect(markDeepRunnerProfileHealthy(statePath, 'team')).toEqual({
      version: 1,
      active: 'team',
      lastKnownGood: 'team',
    })
    expect(readDeepRunnerProfileState(statePath).active).toBe('team')
  })

  it('rolls an unconfirmed generation back to last-known-good', () => {
    const { homeDir, statePath } = fixture()
    writeProfile(homeDir, 'team', ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    selectDeepRunnerProfile(statePath, homeDir, 'team')
    beginDeepRunnerProfileStartup(statePath, homeDir)
    const retry = beginDeepRunnerProfileStartup(statePath, homeDir)
    expect(retry).toMatchObject({
      profileName: 'deeprunner',
      rolledBackFrom: 'team',
      recoveredState: true,
    })
  })

  it('rejects an incompatible target without changing state', () => {
    const { homeDir, statePath } = fixture()
    writeProfile(homeDir, 'cli-only', ['@deepseek-ai/dsh-base'])
    expect(() => selectDeepRunnerProfile(statePath, homeDir, 'cli-only')).toThrow(/cannot be selected/u)
    expect(existsSync(statePath)).toBe(false)
  })

  it('recovers malformed state and can reset to an explicit safe target', () => {
    const { homeDir, statePath } = fixture()
    mkdirSync(join(statePath, '..'), { recursive: true })
    writeFileSync(statePath, '{not-json', 'utf8')
    expect(beginDeepRunnerProfileStartup(statePath, homeDir)).toMatchObject({
      profileName: 'deeprunner',
      recoveredState: true,
    })
    writeProfile(homeDir, 'team', ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    expect(resetDeepRunnerProfileSelection(statePath, homeDir, 'team')).toEqual({
      version: 1,
      active: 'team',
      lastKnownGood: 'team',
    })
  })
})
