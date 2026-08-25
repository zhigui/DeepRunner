import { PassThrough, Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import {
  parseDeepRunnerProfileName,
  type DeepRunnerPackages,
  type DeepRunnerProfiles,
} from '@deeprunner/contracts'
import { DeepRunnerMarketCatalogService } from '../src/catalog.js'
import { DeepRunnerMarketOperationService } from '../src/operations.js'
import { handleDeepRunnerMarketRequest } from '../src/transport.js'

const ORIGIN = 'http://127.0.0.1:4010'

function profiles(): DeepRunnerProfiles {
  return {
    current: { name: parseDeepRunnerProfileName('deeprunner'), dir: '/tmp/profile' },
    list: () => [],
    select: async () => {},
  }
}

function packages(): DeepRunnerPackages {
  const handle = {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    done: new Promise<never>(() => {}),
    cancel: () => {},
  }
  return { allowBuildScripts: () => {}, runPnpm: () => handle, runPlugin: () => handle }
}

function request(
  method: string,
  path: string,
  body?: unknown,
  origin: string | null = ORIGIN,
): IncomingMessage {
  const chunks = body === undefined ? [] : [JSON.stringify(body)]
  return Object.assign(Readable.from(chunks), {
    method,
    url: path,
    headers: {
      ...(origin === null ? {} : { origin }),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
  }) as unknown as IncomingMessage
}

function response(): {
  readonly value: ServerResponse
  readonly status: () => number
  readonly ended: () => boolean
  readonly json: () => unknown
} {
  const chunks: Buffer[] = []
  let ended = false
  const target = {
    statusCode: 200,
    setHeader: () => target,
    end: (chunk?: Uint8Array) => {
      if (chunk !== undefined) chunks.push(Buffer.from(chunk))
      ended = true
      return target
    },
  }
  return {
    value: target as unknown as ServerResponse,
    status: () => target.statusCode,
    ended: () => ended,
    json: () => JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
  }
}

function services() {
  const profileService = profiles()
  const catalog = new DeepRunnerMarketCatalogService({ profiles: profileService, platform: 'darwin' })
  return {
    expectedOrigin: ORIGIN,
    catalog,
    operations: new DeepRunnerMarketOperationService({
      catalog,
      profiles: profileService,
      packages: packages(),
    }),
  }
}

describe('DeepRunner market transport', () => {
  it('serves a bounded catalog without requiring a GET Origin header', async () => {
    const res = response()
    await handleDeepRunnerMarketRequest(
      request('GET', '/__deeprunner/market/catalog', undefined, null),
      res.value,
      services(),
    )
    expect(res.status()).toBe(200)
    expect(res.json()).toMatchObject({ sourceId: 'deeprunner-official', profile: 'deeprunner' })
  })

  it('waits for the initial remote catalog decision before serving catalog data', async () => {
    let ready!: () => void
    const catalogReady = new Promise<void>(resolve => { ready = resolve })
    const res = response()
    const pending = handleDeepRunnerMarketRequest(
      request('GET', '/__deeprunner/market/catalog', undefined, null),
      res.value,
      { ...services(), catalogReady },
    )
    await new Promise<void>(resolve => { setImmediate(resolve) })
    expect(res.ended()).toBe(false)
    ready()
    await pending
    expect(res.ended()).toBe(true)
    expect(res.json()).toMatchObject({ source: { kind: 'embedded' } })
  })

  it('rejects foreign origins and client-selected packages outside the catalog', async () => {
    const foreign = response()
    await handleDeepRunnerMarketRequest(
      request('POST', '/__deeprunner/market/operations', {
        pluginId: 'deeprunner-plugin-market',
        kind: 'remove',
      }, 'http://example.com'),
      foreign.value,
      services(),
    )
    expect(foreign.status()).toBe(403)

    const unknown = response()
    await handleDeepRunnerMarketRequest(
      request('POST', '/__deeprunner/market/operations/preview', {
        pluginId: 'attacker-selected-package',
        kind: 'install',
        packageName: 'malicious-package',
      }),
      unknown.value,
      services(),
    )
    expect(unknown.status()).toBe(400)
    expect(unknown.json()).toMatchObject({ error: 'operation-rejected' })
  })

  it('requires a fresh opaque preview token before executing a mutation', async () => {
    const target = services()
    target.catalog.adoptExternalCatalog({
      schemaVersion: 1,
      catalogVersion: 'transport-test',
      generatedAt: '2026-08-24T00:00:00.000Z',
      sourceId: 'transport-test',
      sourceRevision: 'transport-test',
      entries: [{
        id: 'dsh-im',
        packageName: '@xmanrui/dsh-im',
        displayName: 'DSH IM',
        summary: 'Transport test plugin',
        description: 'Third-party plugin supplied by a remote catalog fixture.',
        publisher: 'xmanrui',
        trustLevel: 'community',
        license: 'MIT',
        tags: ['test'],
        status: 'listed',
        release: {
          version: '1.0.2',
          exactSpec: '@xmanrui/dsh-im@1.0.2',
          distIntegrity: `sha512-${Buffer.from('transport-fixture').toString('base64')}`,
          sourceRevision: 'transport-fixture',
          publishedAt: '2026-08-24T00:00:00.000Z',
          dshVersionRange: '^0.1.0-rc.6',
          platforms: ['darwin'],
          faces: ['host'],
          capabilities: [],
        },
      }],
    }, { kind: 'remote' })
    const preview = response()
    await handleDeepRunnerMarketRequest(
      request('POST', '/__deeprunner/market/operations/preview', {
        pluginId: 'dsh-im',
        kind: 'install',
      }),
      preview.value,
      target,
    )
    expect(preview.status()).toBe(200)
    const token = (preview.json() as { token: string }).token

    const execute = response()
    await handleDeepRunnerMarketRequest(
      request('POST', '/__deeprunner/market/operations', { token }),
      execute.value,
      target,
    )
    expect(execute.status()).toBe(202)
    expect(execute.json()).toMatchObject({ pluginId: 'dsh-im', state: 'running' })

    const replay = response()
    await handleDeepRunnerMarketRequest(
      request('POST', '/__deeprunner/market/operations', { token }),
      replay.value,
      target,
    )
    expect(replay.status()).toBe(400)
  })

  it('requires an explicit same-origin request before restart', async () => {
    const res = response()
    await handleDeepRunnerMarketRequest(
      request('POST', '/__deeprunner/market/restart', undefined, null),
      res.value,
      services(),
    )
    expect(res.status()).toBe(403)
  })
})
