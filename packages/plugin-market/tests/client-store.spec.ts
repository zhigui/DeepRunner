import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  DeepRunnerMarketCatalogEntryView,
  DeepRunnerMarketCatalogView,
  DeepRunnerMarketManualResolveView,
  DeepRunnerMarketOperationPreview,
  DeepRunnerMarketOperationView,
} from '../src/contract.js'
import { MarketStore } from '../src/client/store.js'

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const emptyCatalog: DeepRunnerMarketCatalogView = {
  schemaVersion: 1,
  catalogVersion: 'test',
  generatedAt: '2026-08-23T00:00:00.000Z',
  sourceId: 'test',
  source: { kind: 'embedded' },
  profile: 'deeprunner',
  entries: [],
}

const manualPreview: DeepRunnerMarketManualResolveView = {
  token: 'manual-token',
  expiresAt: '2026-08-23T00:05:00.000Z',
  profile: 'deeprunner',
  sourceKind: 'npm',
  normalizedSource: 'fixture-plugin@1.2.3',
  warning: 'Sideloaded · Unverified',
  updateAvailable: false,
  entry: {
    id: 'sideload-fixture',
    packageName: 'fixture-plugin',
    displayName: 'Fixture Plugin',
    summary: 'Fixture summary',
    description: 'Fixture description',
    publisher: 'Fixture',
    trustLevel: 'sideloaded',
    license: 'MIT',
    tags: [],
    status: 'listed',
    release: {
      version: '1.2.3',
      exactSpec: 'fixture-plugin@1.2.3',
      distIntegrity: `sha512-${Buffer.from('fixture').toString('base64')}`,
      sourceRevision: 'fixture',
      publishedAt: '2026-08-23T00:00:00.000Z',
      dshVersionRange: '^0.1.1-rc.2',
      platforms: ['darwin'],
      faces: ['host'],
      capabilities: ['network-access'],
    },
  },
}

const manualRunning: DeepRunnerMarketOperationView = {
  id: 'operation-1',
  pluginId: manualPreview.entry.id,
  kind: 'install',
  state: 'running',
  startedAt: '2026-08-23T00:00:01.000Z',
  stdout: '',
  stderr: '',
}

const marketEntry: DeepRunnerMarketCatalogEntryView = {
  id: 'fixture',
  packageName: 'fixture-plugin',
  displayName: 'Fixture',
  summary: 'Fixture summary',
  description: 'Fixture description',
  publisher: 'Fixture publisher',
  trustLevel: 'verified-publisher',
  license: 'MIT',
  tags: [],
  status: 'listed',
  release: {
    version: '1.0.0',
    exactSpec: 'fixture-plugin@1.0.0',
    distIntegrity: 'sha512-fixture',
    sourceRevision: 'fixture-revision',
    publishedAt: '2026-08-23T00:00:00.000Z',
    dshVersionRange: '*',
    platforms: ['darwin'],
    faces: ['client'],
    capabilities: [],
  },
  installed: false,
  compatible: true,
  activationStatus: 'not-installed',
  marketManaged: false,
  revoked: false,
  canCheckSideloadUpdates: false,
  canSwitchToMarket: false,
}

const operationPreview: DeepRunnerMarketOperationPreview = {
  token: 'preview-token',
  pluginId: marketEntry.id,
  kind: 'install',
  packageName: marketEntry.packageName,
  version: marketEntry.release.version,
  profile: 'deeprunner',
  expiresAt: '2026-08-23T01:00:00.000Z',
}

const marketRunning: DeepRunnerMarketOperationView = {
  id: 'market-operation-1',
  pluginId: marketEntry.id,
  kind: 'install',
  state: 'running',
  startedAt: '2026-08-23T00:00:00.000Z',
  stdout: '',
  stderr: '',
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('MarketStore install flow', () => {
  it('does not request a restart when the server applied the plugin live', async () => {
    const completed: DeepRunnerMarketOperationView = {
      ...marketRunning,
      state: 'succeeded',
      finishedAt: '2026-08-23T00:00:01.000Z',
      exitCode: 0,
      activation: { status: 'live' },
    }
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(operationPreview))
      .mockResolvedValueOnce(json(completed, 202))
      .mockResolvedValueOnce(json(emptyCatalog))
    const store = new MarketStore()

    await store.start('install', marketEntry)
    await Promise.resolve()

    expect(store.snapshot()).toMatchObject({
      restartRequired: false,
      restartRequirements: {},
      restartPromptOpen: false,
      operation: { activation: { status: 'live' } },
    })
  })

  it('starts installation without a confirmation and preserves a deferred restart', async () => {
    const completed: DeepRunnerMarketOperationView = {
      ...marketRunning,
      state: 'succeeded',
      finishedAt: '2026-08-23T00:00:01.000Z',
      stdout: 'installed',
      exitCode: 0,
    }
    const installedCatalog: DeepRunnerMarketCatalogView = {
      ...emptyCatalog,
      entries: [{ ...marketEntry, installed: true, installedVersion: '1.0.0', activationStatus: 'active' }],
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(operationPreview))
      .mockResolvedValueOnce(json(marketRunning, 202))
      .mockResolvedValueOnce(json(completed))
      .mockResolvedValueOnce(json(installedCatalog))
    const store = new MarketStore()

    await store.start('install', marketEntry)
    expect(store.snapshot().pending).toBeUndefined()
    expect(store.snapshot().operation).toMatchObject({ state: 'running' })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await store.refreshOperation()
    await Promise.resolve()
    expect(store.snapshot()).toMatchObject({
      restartRequired: true,
      restartRequirements: { fixture: 'Restart DeepRunner to apply this plugin change.' },
      restartPromptOpen: true,
      operation: { state: 'succeeded' },
    })

    store.deferRestart()
    expect(store.snapshot()).toMatchObject({ restartRequired: true, restartPromptOpen: false })
  })

  it.each(['enable', 'disable'] as const)('executes %s without showing a review dialog', async (kind) => {
    const preview: DeepRunnerMarketOperationPreview = { ...operationPreview, kind }
    const operation: DeepRunnerMarketOperationView = {
      ...marketRunning,
      kind,
      state: 'succeeded',
      finishedAt: '2026-08-23T00:00:01.000Z',
      exitCode: 0,
    }
    const installedCatalog: DeepRunnerMarketCatalogView = {
      ...emptyCatalog,
      entries: [{
        ...marketEntry,
        installed: true,
        installedVersion: '1.0.0',
        activationStatus: kind === 'enable' ? 'active' : 'disabled',
      }],
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(preview))
      .mockResolvedValueOnce(json(operation, 202))
      .mockResolvedValueOnce(json(installedCatalog))
    const store = new MarketStore()

    await store.start(kind, { ...marketEntry, installed: true, activationStatus: 'active' })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(store.snapshot().pending).toBeUndefined()
    expect(store.snapshot()).toMatchObject({
      restartRequired: true,
      restartPromptOpen: true,
      operation: { kind, state: 'succeeded' },
    })
  })

  it('keeps removal behind the review dialog', async () => {
    const preview: DeepRunnerMarketOperationPreview = { ...operationPreview, kind: 'remove' }
    const removal: DeepRunnerMarketOperationView = { ...marketRunning, kind: 'remove' }
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(preview))
      .mockResolvedValueOnce(json(removal, 202))
    const store = new MarketStore()

    await store.start('remove', { ...marketEntry, installed: true, activationStatus: 'active' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(store.snapshot().pending?.preview).toEqual(preview)
    expect(store.snapshot().operation).toBeUndefined()

    await store.confirmStart()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(store.snapshot().pending).toBeUndefined()
    expect(store.snapshot().operation).toMatchObject({ kind: 'remove', state: 'running' })
  })
})

describe('MarketStore sideload detail transition', () => {
  it('closes the source dialog and keeps a standard detail entry through failure', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const path = String(input)
      if (path.endsWith('/catalog')) return json(emptyCatalog)
      if (path.endsWith('/manual/resolve')) return json(manualPreview)
      if (path.endsWith('/manual/install')) return json(manualRunning, 202)
      if (path.endsWith('/operations/operation-1')) return json({
        ...manualRunning,
        state: 'failed',
        finishedAt: '2026-08-23T00:00:02.000Z',
        error: 'fixture install failed',
        stderr: 'diagnostic output',
      })
      return json({ message: 'unexpected request' }, 500)
    })
    vi.stubGlobal('fetch', fetcher)
    const store = new MarketStore()

    await store.loadCatalog()
    store.setFilter('verified-publisher')
    store.setQuery('does not match sideload')
    store.openManualInstall()
    store.setManualInput('fixture-plugin@1.2.3')
    await store.resolveManualSource()
    await store.installManualSource()

    expect(store.snapshot()).toMatchObject({
      selectedId: manualPreview.entry.id,
      operation: { state: 'running', pluginId: manualPreview.entry.id },
      manual: { open: false },
      manualDetail: { normalizedSource: manualPreview.normalizedSource },
      tab: 'discover',
      filter: 'all',
      query: '',
    })
    expect(store.snapshot().catalog?.entries[0]).toMatchObject({
      id: manualPreview.entry.id,
      trustLevel: 'sideloaded',
      installed: false,
      activationStatus: 'not-installed',
    })

    await store.refreshOperation()
    expect(store.snapshot()).toMatchObject({
      operation: { state: 'failed', error: 'fixture install failed', stderr: 'diagnostic output' },
      manualDetail: { entry: { id: manualPreview.entry.id } },
    })
  })
})
