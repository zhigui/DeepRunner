import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DeepRunnerRuntimeIdentity } from '@deeprunner/contracts/internal/runtime'
import {
  auditDeepRunnerInstalledPlugin,
  createDeepRunnerMarketReceipt,
  marketReleaseCompatibility,
  readDisabledDeepRunnerPlugins,
  readDeepRunnerMarketReceipts,
  saveDeepRunnerMarketReceipt,
  setDeepRunnerPluginDisabled,
} from '../src/compatibility.js'
import type { DeepRunnerMarketEntry } from '../src/contract.js'

const runtime: DeepRunnerRuntimeIdentity = {
  deepRunnerVersion: '1.0.0',
  dshVersion: '0.1.1-rc.2',
  cordisVersion: '4.0.1',
  nodeVersion: '22.0.0',
  electronVersion: '43.4.0',
  nodeModulesVersion: '145',
  architecture: 'arm64',
}

const entry: DeepRunnerMarketEntry = {
  id: 'fixture',
  packageName: 'fixture-plugin',
  displayName: 'Fixture',
  summary: 'Fixture summary',
  description: 'Fixture description',
  publisher: 'Fixture',
  trustLevel: 'verified-publisher',
  license: 'MIT',
  tags: [],
  status: 'listed',
  release: {
    version: '1.0.0',
    exactSpec: 'fixture-plugin@1.0.0',
    distIntegrity: `sha512-${Buffer.from('fixture').toString('base64')}`,
    sourceRevision: 'revision',
    publishedAt: '2026-08-22T00:00:00.000Z',
    dshVersionRange: '^0.1.1-rc.2',
    deepRunnerVersionRange: '^1.0.0',
    platforms: ['darwin'],
    architectures: ['arm64'],
    faces: ['host'],
    capabilities: ['native-dependency'],
    buildScriptPackages: ['node-pty'],
  },
}

function installedFixture(): string {
  const profileDir = mkdtempSync(join(tmpdir(), 'deeprunner-compatibility-'))
  const packageDir = join(profileDir, 'node_modules', entry.packageName)
  mkdirSync(packageDir, { recursive: true })
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
    name: entry.packageName,
    version: entry.release.version,
    engines: { node: '>=20' },
    peerDependencies: {
      '@deepseek-ai/dsh-agent': '^0.1.1-rc.2',
      '@deepseek-ai/cordis': '^4.0.1',
    },
    dependencies: { 'node-pty': '1.1.0' },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }))
  writeFileSync(join(packageDir, 'cordis.patch.yml'), '[]\n')
  writeFileSync(join(profileDir, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      fixture-plugin:\n        specifier: 1.0.0\n        version: 1.0.0\npackages:\n  fixture-plugin@1.0.0:\n    resolution: {integrity: ${entry.release.distIntegrity}}\n`)
  return profileDir
}

describe('DeepRunner plugin compatibility', () => {
  it('checks catalog DSH and DeepRunner ranges before installation', () => {
    expect(marketReleaseCompatibility(entry, runtime, 'darwin', 'arm64')).toEqual({ compatible: true })
    expect(marketReleaseCompatibility(entry, { ...runtime, dshVersion: '0.2.0' }, 'darwin', 'arm64'))
      .toMatchObject({ compatible: false, reason: expect.stringContaining('Requires DSH') })
  })

  it('records native ABI provenance and quarantines it after an app ABI upgrade', () => {
    const profileDir = installedFixture()
    const receipt = createDeepRunnerMarketReceipt(
      profileDir,
      'deeprunner',
      entry,
      { sourceId: 'fixture-market', catalogVersion: 'fixture-1' },
      runtime,
      '2026-08-22T00:00:00.000Z',
    )
    saveDeepRunnerMarketReceipt(profileDir, receipt)
    expect(auditDeepRunnerInstalledPlugin(profileDir, entry.packageName, runtime)).toMatchObject({
      compatible: true,
      managed: true,
    })
    expect(auditDeepRunnerInstalledPlugin(profileDir, entry.packageName, {
      ...runtime,
      nodeModulesVersion: '146',
    })).toMatchObject({
      compatible: false,
      managed: true,
      reason: expect.stringContaining('Remove and reinstall'),
    })
  })

  it('persists a reversible disabled state without changing the installed package', () => {
    const profileDir = installedFixture()
    setDeepRunnerPluginDisabled(profileDir, entry.packageName, true)
    expect(readDisabledDeepRunnerPlugins(profileDir).has(entry.packageName)).toBe(true)
    setDeepRunnerPluginDisabled(profileDir, entry.packageName, false)
    expect(readDisabledDeepRunnerPlugins(profileDir).has(entry.packageName)).toBe(false)
  })

  it('persists the normalized source and entry needed to re-project a sideload', () => {
    const profileDir = installedFixture()
    const sideloadedEntry: DeepRunnerMarketEntry = { ...entry, trustLevel: 'sideloaded' }
    saveDeepRunnerMarketReceipt(profileDir, createDeepRunnerMarketReceipt(
      profileDir,
      'deeprunner',
      sideloadedEntry,
      { sourceId: 'sideload:github', catalogVersion: 'manual' },
      runtime,
      '2026-08-22T00:00:00.000Z',
      { kind: 'github', normalizedSource: 'https://github.com/example/fixture-plugin' },
    ))
    expect(readDeepRunnerMarketReceipts(profileDir)[0]).toMatchObject({
      sourceId: 'sideload:github',
      sideloadedEntry: { packageName: 'fixture-plugin', trustLevel: 'sideloaded' },
      sideloadSource: { kind: 'github', normalizedSource: 'https://github.com/example/fixture-plugin' },
    })
  })
})
