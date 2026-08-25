import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseDeepRunnerProfileName, type DeepRunnerProfiles } from '@deeprunner/contracts'
import type { DeepRunnerMarketEntry, DeepRunnerMarketOperationView } from '../src/contract.js'
import { DeepRunnerManualInstallService } from '../src/manual-install.js'
import type { DeepRunnerMarketOperationService } from '../src/operations.js'
import { saveDeepRunnerMarketReceipt } from '../src/compatibility.js'

function profiles(bundles: readonly string[] = [], dir = '/tmp/deeprunner-manual-test'): DeepRunnerProfiles {
  return {
    current: { name: parseDeepRunnerProfileName('deeprunner'), dir },
    list: () => [{
      name: parseDeepRunnerProfileName('deeprunner'), dir,
      exists: true, bundles, selectable: true, supportsWeb: true, supportsAdvancedMode: true,
    }],
    select: async () => {},
  }
}

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'fixture-plugin', version: '1.2.3', description: 'A fixture DSH plugin',
    license: 'MIT', author: { name: 'Fixture Author' },
    repository: { type: 'git', url: 'git+https://github.com/example/fixture-plugin.git' },
    dependencies: { '@deepseek-ai/dsh-agent': '^0.1.1-rc.2' },
    dsh: { bundle: { patch: './cordis.patch.yml' }, faces: ['host'], capabilities: ['network-access'] },
    dist: { integrity: `sha512-${Buffer.from('fixture').toString('base64')}` },
    ...overrides,
  }
}

function response(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}

function fixture(fetcher: typeof fetch, profileService = profiles()) {
  let installed: DeepRunnerMarketEntry | undefined
  let updated = false
  const operation: DeepRunnerMarketOperationView = {
    id: 'operation-1', pluginId: 'manual', kind: 'install', state: 'running',
    startedAt: '2026-08-23T00:00:00.000Z', stdout: '', stderr: '',
  }
  const operations = {
    startSideload: (entry: DeepRunnerMarketEntry, _source: unknown, update: boolean) => {
      installed = entry
      updated = update
      return { ...operation, pluginId: entry.id, kind: update ? 'update' as const : 'install' as const }
    },
  } as unknown as DeepRunnerMarketOperationService
  const service = new DeepRunnerManualInstallService({
    operations, profiles: profileService, fetcher,
    now: () => new Date('2026-08-23T00:00:00.000Z'), id: () => 'manual-token-1',
  })
  return { service, installed: () => installed, updated: () => updated }
}

describe('DeepRunner manual install resolver', () => {
  it('resolves an exact NPM artifact and consumes a one-time install token', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response(manifest()))
    const test = fixture(fetcher)
    const preview = await test.service.resolve('fixture-plugin@1.2.3')

    expect(fetcher).toHaveBeenCalledWith(
      'https://registry.npmjs.org/fixture-plugin/1.2.3',
      expect.objectContaining({ redirect: 'error' }),
    )
    expect(preview).toMatchObject({
      token: 'manual-token-1', profile: 'deeprunner', sourceKind: 'npm',
      entry: { packageName: 'fixture-plugin', trustLevel: 'sideloaded', release: {
        version: '1.2.3', exactSpec: 'fixture-plugin@1.2.3', faces: ['host'],
      } },
    })
    expect(test.service.install(preview.token)).toMatchObject({ state: 'running', kind: 'install' })
    expect(test.installed()?.packageName).toBe('fixture-plugin')
    expect(() => test.service.install(preview.token)).toThrow(/missing or expired/u)
  })

  it('uses GitHub only to discover a matching published NPM package', async () => {
    const packageJson = Buffer.from(JSON.stringify({ name: 'fixture-plugin' })).toString('base64')
    const fetcher = vi.fn<typeof fetch>(async (input) => String(input).startsWith('https://api.github.com/')
      ? response({ encoding: 'base64', content: packageJson })
      : response(manifest()))
    const test = fixture(fetcher)
    const preview = await test.service.resolve('https://github.com/example/fixture-plugin')

    expect(preview.sourceKind).toBe('github')
    expect(preview.normalizedSource).toBe('https://github.com/example/fixture-plugin')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('rejects packages that require lifecycle scripts or native builds', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response(manifest({
      scripts: { postinstall: 'node build.js' }, dependencies: { 'node-pty': '^1.0.0' },
    })))
    await expect(fixture(fetcher).service.resolve('fixture-plugin')).rejects.toThrow(
      /does not run install scripts or native builds/u,
    )
  })

  it('checks only NPM sideload receipts and updates through a new one-time token', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'deeprunner-manual-update-'))
    const sideloadedEntry: DeepRunnerMarketEntry = {
      id: 'sideload-fixture', packageName: 'fixture-plugin', displayName: 'Fixture Plugin',
      summary: 'Fixture', description: 'Fixture', publisher: 'Fixture', trustLevel: 'sideloaded',
      license: 'MIT', tags: [], status: 'listed',
      release: {
        version: '1.0.0', exactSpec: 'fixture-plugin@1.0.0',
        distIntegrity: `sha512-${Buffer.from('old-fixture').toString('base64')}`,
        sourceRevision: 'old', publishedAt: '2026-08-22T00:00:00.000Z',
        dshVersionRange: '^0.1.1-rc.2', platforms: ['darwin'], faces: ['host'], capabilities: [],
      },
    }
    saveDeepRunnerMarketReceipt(dir, {
      schemaVersion: 1, pluginId: sideloadedEntry.id, profile: 'deeprunner',
      packageName: 'fixture-plugin', version: '1.0.0', sourceId: 'sideload:npm',
      catalogVersion: 'manual', sourceRevision: 'old',
      distIntegrity: sideloadedEntry.release.distIntegrity!, bundlePatch: './cordis.patch.yml',
      buildScriptPackages: [], installedAt: '2026-08-22T00:00:00.000Z',
      installedRuntime: {
        deepRunnerVersion: '0.0.0', dshVersion: '0.1.1-rc.2', cordisVersion: '4.0.1',
        nodeVersion: process.versions.node, electronVersion: '43.4.0',
        nodeModulesVersion: process.versions.modules, architecture: process.arch,
      },
      sideloadedEntry,
      sideloadSource: { kind: 'npm', normalizedSource: 'fixture-plugin@1.0.0' },
    })
    const test = fixture(
      vi.fn<typeof fetch>(async () => response(manifest())),
      profiles(['fixture-plugin'], dir),
    )
    const preview = await test.service.check('fixture-plugin')
    expect(preview).toMatchObject({ installedVersion: '1.0.0', updateAvailable: true,
      entry: { release: { version: '1.2.3' } } })
    expect(test.service.install(preview.token)).toMatchObject({ kind: 'update' })
    expect(test.updated()).toBe(true)
  })
})
