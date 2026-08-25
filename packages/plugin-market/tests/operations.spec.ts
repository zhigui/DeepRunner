import { PassThrough, Readable } from 'node:stream'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parseDeepRunnerProfileName,
  type DeepRunnerPackages,
  type DeepRunnerProcessHandle,
  type DeepRunnerProcessOutcome,
  type DeepRunnerProfiles,
} from '@deeprunner/contracts'
import { DeepRunnerMarketCatalogService } from '../src/catalog.js'
import type { DeepRunnerMarketCatalog } from '../src/contract.js'
import { DeepRunnerMarketOperationService } from '../src/operations.js'
import {
  createDeepRunnerMarketReceipt,
  readDeepRunnerMarketReceipts,
  saveDeepRunnerMarketReceipt,
} from '../src/compatibility.js'

function catalog(status: 'listed' | 'paused' = 'listed'): DeepRunnerMarketCatalog {
  return {
    schemaVersion: 1,
    catalogVersion: 'test',
    generatedAt: '2026-08-22T00:00:00.000Z',
    sourceId: 'test',
    sourceRevision: 'revision',
    entries: [{
      id: 'fixture',
      packageName: 'fixture-plugin',
      displayName: 'Fixture',
      summary: 'Fixture summary',
      description: 'Fixture description',
      publisher: 'Fixture',
      trustLevel: 'verified-publisher',
      license: 'MIT',
      tags: [],
      status,
      release: {
        version: '1.0.0',
        exactSpec: 'fixture-plugin@1.0.0',
        distIntegrity: `sha512-${Buffer.from('fixture').toString('base64')}`,
        sourceRevision: 'commit',
        publishedAt: '2026-08-22T00:00:00.000Z',
        dshVersionRange: '0.1.1-rc.2',
        platforms: ['darwin'],
        faces: ['host'],
        capabilities: [],
        buildScriptPackages: ['fixture-native'],
      },
    }],
  }
}

function profileService(dir: string, bundles: readonly string[] = []): DeepRunnerProfiles {
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

function packageFixture(integrity = `sha512-${Buffer.from('fixture').toString('base64')}`): {
  readonly packages: DeepRunnerPackages
  readonly calls: Array<{ runner: 'pnpm' | 'plugin'; args: readonly string[]; cwd?: string }>
  readonly allowedBuildScripts: readonly string[][]
  readonly settle: (outcome: DeepRunnerProcessOutcome) => void
  readonly stdout: PassThrough
  readonly cancelled: () => boolean
} {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const calls: Array<{ runner: 'pnpm' | 'plugin'; args: readonly string[]; cwd?: string }> = []
  const allowedBuildScripts: string[][] = []
  let resolveOutcome!: (outcome: DeepRunnerProcessOutcome) => void
  let cancelled = false
  const done = new Promise<DeepRunnerProcessOutcome>(resolve => { resolveOutcome = resolve })
  const handle: DeepRunnerProcessHandle = {
    stdout,
    stderr,
    done,
    cancel: () => { cancelled = true },
  }
  return {
    packages: {
      allowBuildScripts: packageNames => { allowedBuildScripts.push([...packageNames]) },
      runPnpm: (args) => {
        calls.push({ runner: 'pnpm', args })
        return {
          stdout: Readable.from([JSON.stringify(integrity)]),
          stderr: Readable.from([]),
          done: Promise.resolve({ exitCode: 0, signal: null }),
          cancel: () => {},
        }
      },
      runPlugin: (args, cwd) => {
        calls.push({ runner: 'plugin', args, cwd })
        return handle
      },
    },
    calls,
    allowedBuildScripts,
    settle: (outcome) => {
      stdout.end()
      stderr.end()
      resolveOutcome(outcome)
    },
    stdout,
    cancelled: () => cancelled,
  }
}

function operationFixture(
  status: 'listed' | 'paused' = 'listed',
  integrity?: string,
  installed = false,
) {
  const dir = mkdtempSync(join(tmpdir(), 'deeprunner-market-operation-'))
  const packageDir = join(dir, 'node_modules', 'fixture-plugin')
  mkdirSync(packageDir, { recursive: true })
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
    name: 'fixture-plugin',
    version: '1.0.0',
    engines: { node: '>=20' },
    peerDependencies: { '@deepseek-ai/dsh-agent': '^0.1.1-rc.2' },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }))
  writeFileSync(join(packageDir, 'cordis.patch.yml'), '[]\n')
  const expectedIntegrity = `sha512-${Buffer.from('fixture').toString('base64')}`
  writeFileSync(join(dir, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      fixture-plugin:\n        specifier: 1.0.0\n        version: 1.0.0\npackages:\n  fixture-plugin@1.0.0:\n    resolution: {integrity: ${expectedIntegrity}}\n`)
  const profiles = profileService(dir, installed ? ['fixture-plugin'] : [])
  const process = packageFixture(integrity)
  const operations = new DeepRunnerMarketOperationService({
    catalog: new DeepRunnerMarketCatalogService({
      catalog: catalog(status),
      profiles,
      platform: 'darwin',
    }),
    packages: process.packages,
    profiles,
    id: () => 'operation-1',
    now: () => new Date('2026-08-22T01:02:03.000Z'),
  })
  return { operations, process, dir }
}

describe('DeepRunner market operations', () => {
  it('resolves exact catalog targets and projects bounded process completion', async () => {
    const { operations, process } = operationFixture()
    const started = operations.start('fixture', 'install')
    expect(started).toMatchObject({ id: 'operation-1', state: 'running' })
    await new Promise<void>(resolve => { setImmediate(resolve) })
    expect(process.calls).toEqual([{
      runner: 'pnpm',
      args: ['view', 'fixture-plugin@1.0.0', 'dist.integrity', '--json'],
    }, {
      runner: 'plugin',
      args: ['add', 'fixture-plugin@1.0.0'],
      cwd: expect.stringContaining('deeprunner-market-operation-'),
    }])
    expect(process.allowedBuildScripts).toEqual([['fixture-native']])
    process.stdout.write('installed')
    process.settle({ exitCode: 0, signal: null })
    await new Promise<void>(resolve => { setImmediate(resolve) })
    expect(operations.get('operation-1')).toMatchObject({
      state: 'succeeded',
      stdout: 'installed',
      exitCode: 0,
    })
  })

  it('blocks paused releases and lets a running operation be cancelled', async () => {
    expect(() => operationFixture('paused').operations.start('fixture', 'install')).toThrow(/paused/u)
    const { operations, process } = operationFixture('listed', undefined, true)
    operations.start('fixture', 'remove')
    expect(operations.cancel('operation-1')).toMatchObject({ state: 'running' })
    expect(process.cancelled()).toBe(true)
    process.settle({ exitCode: null, signal: 'SIGTERM' })
    await new Promise<void>(resolve => { setImmediate(resolve) })
    expect(operations.get('operation-1')?.state).toBe('cancelled')
  })

  it('rejects client-selected ids outside the current catalog', () => {
    expect(() => operationFixture().operations.start('other', 'install')).toThrow(/Unknown/u)
  })

  it('only shows native build warnings for artifact installation previews', () => {
    expect(operationFixture().operations.preview('fixture', 'install').warning).toMatch(/build scripts/u)
    expect(operationFixture('listed', undefined, true).operations.preview('fixture', 'remove').warning).toBeUndefined()
  })

  it('does not present a same-version update as an installation repair', () => {
    expect(() => operationFixture('listed', undefined, true).operations.start('fixture', 'update'))
      .toThrow(/remove and reinstall/u)
  })

  it('disables and enables an installed plugin without invoking pnpm', async () => {
    const disabled = operationFixture('listed', undefined, true)
    disabled.operations.start('fixture', 'disable')
    await new Promise<void>(resolve => { setImmediate(resolve) })
    expect(disabled.operations.get('operation-1')).toMatchObject({ state: 'succeeded', exitCode: 0 })
    expect(disabled.process.calls).toEqual([])

    const enabled = operationFixture('listed', undefined, true)
    enabled.operations.start('fixture', 'disable')
    await new Promise<void>(resolve => { setImmediate(resolve) })
    enabled.operations.start('fixture', 'enable')
    await new Promise<void>(resolve => { setImmediate(resolve) })
    expect(enabled.operations.get('operation-1')).toMatchObject({ state: 'succeeded', exitCode: 0 })
    expect(enabled.process.calls).toEqual([])
  })

  it('fails closed before install when registry integrity differs from the catalog', async () => {
    const { operations, process } = operationFixture('listed', `sha512-${Buffer.from('other').toString('base64')}`)
    operations.start('fixture', 'install')
    await new Promise<void>(resolve => { setImmediate(resolve) })
    expect(operations.get('operation-1')).toMatchObject({
      state: 'failed',
      error: 'Plugin artifact integrity does not match the market catalog',
    })
    expect(process.calls.some(call => call.runner === 'plugin')).toBe(false)
  })

  it('switches a matching sideload receipt to the controlled Market source', async () => {
    const test = operationFixture('listed', undefined, true)
    const marketEntry = catalog().entries[0]!
    saveDeepRunnerMarketReceipt(test.dir, createDeepRunnerMarketReceipt(
      test.dir, 'deeprunner', { ...marketEntry, trustLevel: 'sideloaded' },
      { sourceId: 'sideload:npm', catalogVersion: 'manual' },
      {
        deepRunnerVersion: '0.0.0', dshVersion: '0.1.1-rc.2', cordisVersion: '4.0.1',
        nodeVersion: process.versions.node, electronVersion: process.versions.electron ?? '0.0.0',
        nodeModulesVersion: process.versions.modules, architecture: process.arch,
      },
      '2026-08-22T00:00:00.000Z',
      { kind: 'npm', normalizedSource: 'fixture-plugin@1.0.0' },
    ))
    test.operations.start('fixture', 'switch')
    await new Promise<void>(resolve => { setImmediate(resolve) })
    expect(test.process.calls.at(-1)).toMatchObject({ runner: 'plugin', args: ['add', 'fixture-plugin@1.0.0'] })
    test.process.settle({ exitCode: 0, signal: null })
    await new Promise<void>(resolve => { setImmediate(resolve) })
    expect(test.operations.get('operation-1')?.state).toBe('succeeded')
    expect(readDeepRunnerMarketReceipts(test.dir)[0]).toMatchObject({
      sourceId: 'test', pluginId: 'fixture', packageName: 'fixture-plugin',
    })
    expect(readDeepRunnerMarketReceipts(test.dir)[0]?.sideloadSource).toBeUndefined()
  })
})
