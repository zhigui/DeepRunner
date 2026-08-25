import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { parseDeepRunnerProfileName, type DeepRunnerProfiles } from '@deeprunner/contracts'
import { DeepRunnerMarketCatalogService } from '../src/catalog.js'
import type { DeepRunnerMarketCatalog } from '../src/contract.js'
import { DeepRunnerRemoteCatalogController } from '../src/remote-catalog.js'

const directories: string[] = []
const SOURCE_URL = 'https://example.com/catalog.json'

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

function profiles(directory: string): DeepRunnerProfiles {
  return {
    current: { name: parseDeepRunnerProfileName('deeprunner'), dir: directory },
    list: () => [{
      name: parseDeepRunnerProfileName('deeprunner'),
      dir: directory,
      exists: true,
      bundles: [],
      selectable: true,
      supportsWeb: true,
      supportsAdvancedMode: true,
    }],
    select: async () => {},
  }
}

function externalCatalog(version = '1.0.0'): DeepRunnerMarketCatalog {
  return {
    schemaVersion: 1,
    catalogVersion: `test-${version}`,
    generatedAt: '2026-08-22T00:00:00.000Z',
    sourceId: 'remote-test',
    sourceRevision: `revision-${version}`,
    entries: [{
      id: 'remote-fixture',
      packageName: 'remote-fixture',
      displayName: 'Remote Fixture',
      summary: 'Remote fixture summary',
      description: 'Remote fixture description',
      publisher: 'Fixture Publisher',
      trustLevel: 'community',
      license: 'MIT',
      tags: ['fixture'],
      status: 'listed',
      release: {
        version,
        exactSpec: `remote-fixture@${version}`,
        distIntegrity: `sha512-${Buffer.from(`fixture-${version}`).toString('base64')}`,
        sourceRevision: `commit-${version}`,
        publishedAt: '2026-08-22T00:00:00.000Z',
        dshVersionRange: '0.1.1-rc.2',
        platforms: ['darwin'],
        faces: ['host'],
        capabilities: [],
      },
    }],
  }
}

async function fixture(): Promise<{
  readonly directory: string
  readonly cachePath: string
  readonly profiles: DeepRunnerProfiles
}> {
  const directory = await mkdtemp(join(tmpdir(), 'deeprunner-market-'))
  directories.push(directory)
  return { directory, cachePath: join(directory, 'cache.json'), profiles: profiles(directory) }
}

describe('DeepRunner remote market catalog', () => {
  it('adopts a valid fixed HTTPS catalog, keeps built-ins and writes last-known-good cache', async () => {
    const target = await fixture()
    const catalog = new DeepRunnerMarketCatalogService({ profiles: target.profiles, platform: 'darwin' })
    const controller = new DeepRunnerRemoteCatalogController({
      catalog,
      profiles: target.profiles,
      sourceUrl: SOURCE_URL,
      cachePath: target.cachePath,
      now: () => new Date('2026-08-22T03:04:05.000Z'),
      fetch: async (_input, init) => {
        expect(init.redirect).toBe('error')
        return new Response(JSON.stringify(externalCatalog()), {
          status: 200,
          headers: { etag: '"catalog-1"' },
        })
      },
    })
    await controller.start()
    expect(catalog.view()).toMatchObject({
      sourceId: 'remote-test',
      source: { kind: 'remote', url: SOURCE_URL, checkedAt: '2026-08-22T03:04:05.000Z' },
    })
    expect(catalog.catalog.entries.map(entry => entry.id)).toEqual([
      'deeprunner-desktop',
      'deeprunner-plugin-market',
      'remote-fixture',
    ])
    expect(JSON.parse(await readFile(target.cachePath, 'utf8'))).toMatchObject({
      schemaVersion: 1,
      sourceUrl: SOURCE_URL,
      etag: '"catalog-1"',
      catalog: { catalogVersion: 'test-1.0.0' },
    })
  })

  it('uses last-known-good cache when the network is unavailable', async () => {
    const target = await fixture()
    const first = new DeepRunnerMarketCatalogService({ profiles: target.profiles })
    await new DeepRunnerRemoteCatalogController({
      catalog: first,
      profiles: target.profiles,
      sourceUrl: SOURCE_URL,
      cachePath: target.cachePath,
      fetch: async () => new Response(JSON.stringify(externalCatalog()), { status: 200 }),
      now: () => new Date('2026-08-22T03:04:05.000Z'),
    }).start()

    const offline = new DeepRunnerMarketCatalogService({ profiles: target.profiles })
    await new DeepRunnerRemoteCatalogController({
      catalog: offline,
      profiles: target.profiles,
      sourceUrl: SOURCE_URL,
      cachePath: target.cachePath,
      fetch: async () => { throw new Error('offline') },
    }).start()
    expect(offline.view()).toMatchObject({
      sourceId: 'remote-test',
      source: { kind: 'cache', warning: 'Remote catalog unavailable: offline' },
    })
    expect(offline.entry('remote-fixture')).toBeDefined()
  })

  it('rejects corrupt cache and hostile remote built-in declarations, then stays embedded', async () => {
    const target = await fixture()
    await writeFile(target.cachePath, '{"schemaVersion":999}', 'utf8')
    const hostile = externalCatalog()
    hostile.entries[0]!.trustLevel = 'builtin'
    delete hostile.entries[0]!.release.exactSpec
    delete hostile.entries[0]!.release.distIntegrity
    const catalog = new DeepRunnerMarketCatalogService({ profiles: target.profiles })
    await new DeepRunnerRemoteCatalogController({
      catalog,
      profiles: target.profiles,
      sourceUrl: SOURCE_URL,
      cachePath: target.cachePath,
      fetch: async () => new Response(JSON.stringify(hostile), { status: 200 }),
    }).start()
    expect(catalog.view().source).toMatchObject({
      kind: 'embedded',
      warning: 'Remote catalog unavailable: remote catalog cannot declare built-in components',
    })
    expect(catalog.entry('dsh-im')).toBeUndefined()
    expect(catalog.entry('remote-fixture')).toBeUndefined()
  })
})
