import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseDeepRunnerProfileName, type DeepRunnerProfiles } from '@deeprunner/contracts'
import {
  BUILTIN_MARKET_CATALOG,
  DeepRunnerMarketCatalogService,
  parseDeepRunnerMarketCatalog,
} from '../src/catalog.js'
import type { DeepRunnerMarketCatalog } from '../src/contract.js'
import { createDeepRunnerMarketReceipt, saveDeepRunnerMarketReceipt } from '../src/compatibility.js'

function profiles(bundles: readonly string[] = [], dir = '/tmp/deeprunner'): DeepRunnerProfiles {
  return {
    current: { name: parseDeepRunnerProfileName('deeprunner'), dir },
    list: () => [{
      name: parseDeepRunnerProfileName('deeprunner'),
      dir,
      exists: true,
      bundles,
      selectable: true,
      supportsWeb: true,
      supportsAdvancedMode: true,
    }],
    select: async () => {},
  }
}

function communityCatalog(): DeepRunnerMarketCatalog {
  return {
    schemaVersion: 1,
    catalogVersion: 'test-1',
    generatedAt: '2026-08-22T00:00:00.000Z',
    sourceId: 'test-source',
    sourceRevision: 'revision-1',
    entries: [{
      id: 'community-fixture',
      packageName: 'community-fixture',
      displayName: 'Community Fixture',
      summary: 'Fixture summary',
      description: 'Fixture description',
      publisher: 'Fixture Publisher',
      trustLevel: 'community',
      license: 'MIT',
      tags: ['fixture'],
      status: 'listed',
      release: {
        version: '1.2.3',
        exactSpec: 'community-fixture@1.2.3',
        distIntegrity: `sha512-${Buffer.from('fixture').toString('base64')}`,
        sourceRevision: 'commit-1',
        publishedAt: '2026-08-22T00:00:00.000Z',
        dshVersionRange: '0.1.1-rc.2',
        platforms: ['darwin'],
        faces: ['host'],
        capabilities: ['filesystem'],
      },
    }],
  }
}

describe('DeepRunner market catalog', () => {
  it('parses the embedded catalog and projects installed built-ins', () => {
    const catalog = parseDeepRunnerMarketCatalog(BUILTIN_MARKET_CATALOG)
    expect(catalog.entries).toHaveLength(2)
    expect(catalog.entries.every(entry => entry.trustLevel === 'builtin')).toBe(true)
    const view = new DeepRunnerMarketCatalogService({
      profiles: profiles(),
      platform: 'darwin',
      architecture: 'arm64',
    }).view()
    expect(view.profile).toBe('deeprunner')
    expect(view.entries.filter(entry => entry.trustLevel === 'builtin').every(entry => entry.installed)).toBe(true)
    expect(view.entries.find(entry => entry.id === 'dsh-im')).toBeUndefined()
  })

  it('accepts a scoped npm package identity as the market id', () => {
    const scoped = communityCatalog()
    scoped.entries[0] = {
      ...scoped.entries[0]!,
      id: '@fixture/community-fixture',
      packageName: '@fixture/community-fixture',
      release: {
        ...scoped.entries[0]!.release,
        exactSpec: '@fixture/community-fixture@1.2.3',
      },
    }
    expect(parseDeepRunnerMarketCatalog(scoped).entries[0]?.id).toBe('@fixture/community-fixture')
  })

  it('keeps trust, integrity, compatibility and installation as independent facts', () => {
    const service = new DeepRunnerMarketCatalogService({
      catalog: communityCatalog(),
      profiles: profiles(['community-fixture']),
      platform: 'linux',
      architecture: 'x64',
    })
    expect(service.view().entries[0]).toMatchObject({
      trustLevel: 'community',
      installed: true,
      compatible: false,
      compatibilityReason: 'Not available on linux',
      revoked: false,
    })
  })

  it('re-projects persisted sideload receipts into Installed management', () => {
    const dir = mkdtempSync(join(tmpdir(), 'deeprunner-sideload-catalog-'))
    const sideloaded = {
      ...communityCatalog().entries[0]!,
      id: 'sideload-fixture', packageName: 'sideload-fixture', trustLevel: 'sideloaded' as const,
      release: {
        ...communityCatalog().entries[0]!.release,
        exactSpec: 'sideload-fixture@1.2.3',
      },
    }
    const packageDir = join(dir, 'node_modules', sideloaded.packageName)
    mkdirSync(packageDir, { recursive: true })
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
      name: sideloaded.packageName, version: sideloaded.release.version,
      dependencies: { '@deepseek-ai/dsh-agent': '^0.1.1-rc.2' },
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    writeFileSync(join(packageDir, 'cordis.patch.yml'), '[]\n')
    writeFileSync(join(dir, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      sideload-fixture:\n        specifier: 1.2.3\n        version: 1.2.3\npackages:\n  sideload-fixture@1.2.3:\n    resolution: {integrity: ${sideloaded.release.distIntegrity}}\n`)
    const profile = profiles([sideloaded.packageName], dir)
    saveDeepRunnerMarketReceipt(dir, createDeepRunnerMarketReceipt(
      dir, 'deeprunner', sideloaded, { sourceId: 'sideload:npm', catalogVersion: 'manual' },
      {
        deepRunnerVersion: '0.0.0', dshVersion: '0.1.1-rc.2', cordisVersion: '4.0.1',
        nodeVersion: process.versions.node, electronVersion: process.versions.electron ?? '0.0.0',
        nodeModulesVersion: process.versions.modules, architecture: process.arch,
      },
      '2026-08-23T00:00:00.000Z',
      { kind: 'npm', normalizedSource: 'sideload-fixture@1.2.3' },
    ))

    expect(new DeepRunnerMarketCatalogService({
      catalog: communityCatalog(), profiles: profile, platform: 'darwin',
    }).view().entries.find(entry => entry.id === sideloaded.id)).toMatchObject({
      installed: true, activationStatus: 'active', marketManaged: true, trustLevel: 'sideloaded',
      installationOrigin: 'sideload-npm', canCheckSideloadUpdates: true,
      canSwitchToMarket: false,
    })

    const marketEntry = {
      ...communityCatalog().entries[0]!, id: 'market-fixture', packageName: sideloaded.packageName,
      release: { ...communityCatalog().entries[0]!.release, exactSpec: 'sideload-fixture@1.2.3' },
    }
    const marketCatalog = { ...communityCatalog(), entries: [marketEntry] }
    expect(new DeepRunnerMarketCatalogService({
      catalog: marketCatalog, profiles: profile, platform: 'darwin',
    }).view().entries.find(entry => entry.id === marketEntry.id)).toMatchObject({
      installed: true, trustLevel: 'community', installationOrigin: 'sideload-npm',
      canSwitchToMarket: true, canCheckSideloadUpdates: false,
    })
  })

  it('rejects moving specs, missing integrity and duplicate package identities', () => {
    const moving = structuredClone(communityCatalog())
    const movingEntry = moving.entries[0]
    if (movingEntry === undefined) throw new Error('missing fixture')
    movingEntry.release.exactSpec = 'community-fixture@latest'
    expect(() => parseDeepRunnerMarketCatalog(moving)).toThrow(/moving dist tag/u)

    const missing = structuredClone(communityCatalog())
    const missingEntry = missing.entries[0]
    if (missingEntry === undefined) throw new Error('missing fixture')
    delete missingEntry.release.distIntegrity
    expect(() => parseDeepRunnerMarketCatalog(missing)).toThrow(/integrity/u)

    const duplicate = structuredClone(communityCatalog())
    duplicate.entries.push({ ...duplicate.entries[0]!, id: 'another-id' })
    expect(() => parseDeepRunnerMarketCatalog(duplicate)).toThrow(/duplicate market package/u)
  })

  it('lets the remote catalog own third-party build allowlists', () => {
    const external = communityCatalog()
    const service = new DeepRunnerMarketCatalogService({ profiles: profiles() })
    service.adoptExternalCatalog(external, { kind: 'remote' })
    expect(service.entry('community-fixture')?.release.buildScriptPackages).toBeUndefined()

    external.entries[0]!.release.buildScriptPackages = ['node-pty']
    service.adoptExternalCatalog(external, { kind: 'remote' })
    expect(service.entry('community-fixture')?.release.buildScriptPackages).toEqual(['node-pty'])
  })
})
