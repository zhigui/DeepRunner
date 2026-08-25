import { randomUUID } from 'node:crypto'
import {
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { DeepRunnerProfiles } from '@deeprunner/contracts'
import type { DeepRunnerMarketCatalog } from './contract.js'
import { DeepRunnerMarketCatalogService, parseDeepRunnerMarketCatalog } from './catalog.js'

export const DEEPRUNNER_MARKET_CATALOG_URL = 'https://zhigui.github.io/DeepRunnerPlugins/catalog/v1/catalog.json'

const MAX_REMOTE_BYTES = 1024 * 1024
const DEFAULT_TIMEOUT_MS = 6_000
const CACHE_SCHEMA_VERSION = 1

interface CatalogCacheEnvelope {
  readonly schemaVersion: 1
  readonly sourceUrl: string
  readonly fetchedAt: string
  readonly etag?: string
  readonly catalog: DeepRunnerMarketCatalog
}

type FetchCatalog = (input: string, init: RequestInit) => Promise<Response>

export interface DeepRunnerRemoteCatalogOptions {
  readonly catalog: DeepRunnerMarketCatalogService
  readonly profiles: DeepRunnerProfiles
  readonly sourceUrl?: string
  readonly cachePath?: string
  readonly timeoutMs?: number
  readonly fetch?: FetchCatalog
  readonly now?: () => Date
}

function boundedString(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.includes('\0')) {
    throw new Error(`${label} must be a non-empty bounded string`)
  }
  return value
}

function isoTimestamp(value: unknown, label: string): string {
  const timestamp = boundedString(value, label, 64)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(timestamp)
    || Number.isNaN(Date.parse(timestamp))) {
    throw new Error(`${label} must be an ISO UTC timestamp`)
  }
  return timestamp
}

function parseCache(value: unknown, expectedUrl: string): CatalogCacheEnvelope {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('market cache must be an object')
  }
  const record = value as Record<string, unknown>
  const allowed = new Set(['schemaVersion', 'sourceUrl', 'fetchedAt', 'etag', 'catalog'])
  if (Object.keys(record).some(key => !allowed.has(key))) throw new Error('market cache has unknown fields')
  if (record.schemaVersion !== CACHE_SCHEMA_VERSION) throw new Error('unsupported market cache schema')
  const sourceUrl = boundedString(record.sourceUrl, 'cache.sourceUrl', 2_048)
  if (sourceUrl !== expectedUrl) throw new Error('market cache source does not match')
  const fetchedAt = isoTimestamp(record.fetchedAt, 'cache.fetchedAt')
  const etag = record.etag === undefined ? undefined : boundedString(record.etag, 'cache.etag', 512)
  const catalog = parseDeepRunnerMarketCatalog(record.catalog)
  return { schemaVersion: CACHE_SCHEMA_VERSION, sourceUrl, fetchedAt, ...(etag === undefined ? {} : { etag }), catalog }
}

async function readResponseBody(response: Response): Promise<string> {
  const contentLength = response.headers.get('content-length')
  if (contentLength !== null) {
    const declared = Number(contentLength)
    if (!Number.isSafeInteger(declared) || declared < 0 || declared > MAX_REMOTE_BYTES) {
      throw new Error('remote catalog response is too large')
    }
  }
  if (response.body === null) throw new Error('remote catalog response has no body')
  const chunks: Uint8Array[] = []
  let length = 0
  for await (const chunk of response.body) {
    length += chunk.byteLength
    if (length > MAX_REMOTE_BYTES) throw new Error('remote catalog response is too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), length).toString('utf8')
}

async function writeCache(path: string, value: CatalogCacheEnvelope): Promise<void> {
  const directory = dirname(path)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const temporary = `${path}.${String(process.pid)}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(value, undefined, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
    await rename(temporary, path)
  } finally {
    await unlink(temporary).catch(() => {})
  }
}

export function deepRunnerMarketCachePath(profiles: DeepRunnerProfiles): string {
  return join(profiles.current.dir, '.deeprunner', 'market', 'catalog-v1.json')
}

/** Loads last-known-good data first, then refreshes the one fixed HTTPS catalog. */
export class DeepRunnerRemoteCatalogController {
  private readonly catalog: DeepRunnerMarketCatalogService
  private readonly sourceUrl: string
  private readonly cachePath: string
  private readonly timeoutMs: number
  private readonly fetchCatalog: FetchCatalog
  private readonly now: () => Date
  private readonly lifetime = new AbortController()
  private startPromise: Promise<void> | undefined

  constructor(options: DeepRunnerRemoteCatalogOptions) {
    this.catalog = options.catalog
    this.sourceUrl = options.sourceUrl ?? DEEPRUNNER_MARKET_CATALOG_URL
    if (new URL(this.sourceUrl).protocol !== 'https:') throw new Error('market catalog source must use HTTPS')
    this.cachePath = options.cachePath ?? deepRunnerMarketCachePath(options.profiles)
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.fetchCatalog = options.fetch ?? globalThis.fetch
    this.now = options.now ?? (() => new Date())
  }

  start(): Promise<void> {
    this.startPromise ??= this.initialize()
    return this.startPromise
  }

  dispose(): void {
    this.lifetime.abort()
  }

  private async initialize(): Promise<void> {
    let cached: CatalogCacheEnvelope | undefined
    try {
      const info = await stat(this.cachePath)
      if (info.size > MAX_REMOTE_BYTES) throw new Error('market cache is too large')
      cached = parseCache(JSON.parse(await readFile(this.cachePath, 'utf8')) as unknown, this.sourceUrl)
      this.catalog.adoptExternalCatalog(cached.catalog, {
        kind: 'cache',
        url: this.sourceUrl,
        checkedAt: cached.fetchedAt,
      })
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.catalog.setSource({
          kind: 'embedded',
          url: this.sourceUrl,
          warning: `Cached catalog was rejected: ${cause instanceof Error ? cause.message : String(cause)}`,
        })
      }
    }

    try {
      await this.refresh(cached)
    } catch (cause) {
      if (this.lifetime.signal.aborted) return
      const message = cause instanceof Error ? cause.message : String(cause)
      this.catalog.setSource({
        kind: cached === undefined ? 'embedded' : 'cache',
        url: this.sourceUrl,
        ...(cached === undefined ? {} : { checkedAt: cached.fetchedAt }),
        warning: `Remote catalog unavailable: ${message}`,
      })
    }
  }

  private async refresh(cached: CatalogCacheEnvelope | undefined): Promise<void> {
    const timeout = new AbortController()
    const timer = setTimeout(() => { timeout.abort(new Error('remote catalog request timed out')) }, this.timeoutMs)
    const onDispose = (): void => { timeout.abort(new Error('market catalog controller disposed')) }
    this.lifetime.signal.addEventListener('abort', onDispose, { once: true })
    try {
      const response = await this.fetchCatalog(this.sourceUrl, {
        method: 'GET',
        redirect: 'error',
        headers: {
          accept: 'application/json',
          'cache-control': 'no-cache',
          ...(cached?.etag === undefined ? {} : { 'if-none-match': cached.etag }),
        },
        signal: timeout.signal,
      })
      const checkedAt = this.now().toISOString()
      if (response.status === 304 && cached !== undefined) {
        this.catalog.adoptExternalCatalog(cached.catalog, {
          kind: 'remote',
          url: this.sourceUrl,
          checkedAt,
        })
        return
      }
      if (!response.ok) throw new Error(`remote catalog returned HTTP ${String(response.status)}`)
      const parsed: unknown = JSON.parse(await readResponseBody(response))
      const external = parseDeepRunnerMarketCatalog(parsed)
      this.catalog.adoptExternalCatalog(external, {
        kind: 'remote',
        url: this.sourceUrl,
        checkedAt,
      })
      const etag = response.headers.get('etag') ?? undefined
      try {
        await writeCache(this.cachePath, {
          schemaVersion: CACHE_SCHEMA_VERSION,
          sourceUrl: this.sourceUrl,
          fetchedAt: checkedAt,
          ...(etag === undefined ? {} : { etag }),
          catalog: external,
        })
      } catch (cause) {
        this.catalog.setSource({
          kind: 'remote',
          url: this.sourceUrl,
          checkedAt,
          warning: `Remote catalog loaded but cache update failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        })
      }
    } finally {
      clearTimeout(timer)
      this.lifetime.signal.removeEventListener('abort', onDispose)
    }
  }
}
