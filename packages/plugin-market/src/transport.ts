import type { IncomingMessage, ServerResponse } from 'node:http'
import type { DeepRunnerRuntime } from '@deeprunner/contracts/internal/runtime'
import {
  DEEPRUNNER_MARKET_CATALOG_PATH,
  DEEPRUNNER_MARKET_OPERATIONS_PATH,
  DEEPRUNNER_MARKET_PREVIEW_PATH,
  DEEPRUNNER_MARKET_RESTART_PATH,
  DEEPRUNNER_MARKET_MANUAL_INSTALL_PATH,
  DEEPRUNNER_MARKET_MANUAL_CHECK_PATH,
  DEEPRUNNER_MARKET_MANUAL_RESOLVE_PATH,
  type DeepRunnerMarketOperationKind,
  type DeepRunnerMarketOperationRequest,
} from './contract.js'
import { DeepRunnerMarketCatalogService } from './catalog.js'
import { DeepRunnerMarketOperationService } from './operations.js'
import { DeepRunnerManualInstallService } from './manual-install.js'

const MAX_REQUEST_BYTES = 4 * 1024
const OPERATION_ID_PATTERN = /^[0-9A-Za-z-]{1,128}$/u

function sendJson(res: ServerResponse, statusCode: number, value: unknown): void {
  const body = Buffer.from(JSON.stringify(value))
  res.statusCode = statusCode
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('content-length', String(body.byteLength))
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  res.end(body)
}

function validOrigin(req: IncomingMessage, expectedOrigin: string): boolean {
  const origin = req.headers.origin
  return origin === undefined || origin === expectedOrigin
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    size += bytes.byteLength
    if (size > MAX_REQUEST_BYTES) throw new Error('request body is too large')
    chunks.push(bytes)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function contentTypeIsJson(req: IncomingMessage): boolean {
  return req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json'
}

function parseOperationRequest(value: unknown): DeepRunnerMarketOperationRequest {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('operation must be an object')
  }
  const record = value as Record<string, unknown>
  if (typeof record.pluginId !== 'string' || record.pluginId.length === 0 || record.pluginId.length > 214) {
    throw new Error('invalid plugin id')
  }
  if (record.kind !== 'install' && record.kind !== 'update' && record.kind !== 'remove'
    && record.kind !== 'enable' && record.kind !== 'disable' && record.kind !== 'switch') {
    throw new Error('invalid operation kind')
  }
  return { pluginId: record.pluginId, kind: record.kind as DeepRunnerMarketOperationKind }
}

function parseExecuteRequest(value: unknown): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('execute request must be an object')
  }
  const token = (value as Record<string, unknown>).token
  if (typeof token !== 'string' || !OPERATION_ID_PATTERN.test(token)) {
    throw new Error('invalid operation preview token')
  }
  return token
}

function parseManualSource(value: unknown): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('manual source request must be an object')
  }
  const source = (value as Record<string, unknown>).source
  if (typeof source !== 'string' || source.length === 0 || source.length > 2_048) {
    throw new Error('invalid manual source')
  }
  return source
}

function parseManualIdentifier(value: unknown): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('manual check request must be an object')
  }
  const pluginId = (value as Record<string, unknown>).pluginId
  if (typeof pluginId !== 'string' || pluginId.length === 0 || pluginId.length > 214) {
    throw new Error('invalid manual plugin id')
  }
  return pluginId
}

export interface DeepRunnerMarketTransportOptions {
  readonly expectedOrigin: string
  readonly catalog: DeepRunnerMarketCatalogService
  readonly catalogReady?: Promise<void>
  readonly operations: DeepRunnerMarketOperationService
  readonly manual: DeepRunnerManualInstallService
  readonly runtime?: Pick<DeepRunnerRuntime, 'requestRestart'>
}

/** Same-origin bounded HTTP surface for catalog reads and package mutations. */
export async function handleDeepRunnerMarketRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: DeepRunnerMarketTransportOptions,
): Promise<void> {
  if (!validOrigin(req, options.expectedOrigin)) {
    return sendJson(res, 403, { error: 'origin-forbidden' })
  }
  if (req.method !== 'GET' && req.method !== 'HEAD'
    && req.headers.origin !== options.expectedOrigin) {
    return sendJson(res, 403, { error: 'origin-required' })
  }
  let path: string
  try {
    path = new URL(req.url ?? '', options.expectedOrigin).pathname
  } catch {
    return sendJson(res, 400, { error: 'invalid-url' })
  }

  if (path === DEEPRUNNER_MARKET_CATALOG_PATH) {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method-not-allowed' })
    await options.catalogReady
    return sendJson(res, 200, options.catalog.view())
  }

  if (path === DEEPRUNNER_MARKET_MANUAL_RESOLVE_PATH) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method-not-allowed' })
    if (!contentTypeIsJson(req)) return sendJson(res, 415, { error: 'content-type-required' })
    try {
      const source = parseManualSource(await readJson(req))
      return sendJson(res, 200, await options.manual.resolve(source))
    } catch (cause) {
      return sendJson(res, 400, {
        error: 'manual-source-rejected',
        message: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }

  if (path === DEEPRUNNER_MARKET_MANUAL_INSTALL_PATH) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method-not-allowed' })
    if (!contentTypeIsJson(req)) return sendJson(res, 415, { error: 'content-type-required' })
    try {
      return sendJson(res, 202, options.manual.install(parseExecuteRequest(await readJson(req))))
    } catch (cause) {
      return sendJson(res, 400, {
        error: 'manual-install-rejected',
        message: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }

  if (path === DEEPRUNNER_MARKET_MANUAL_CHECK_PATH) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method-not-allowed' })
    if (!contentTypeIsJson(req)) return sendJson(res, 415, { error: 'content-type-required' })
    try {
      return sendJson(res, 200, await options.manual.check(parseManualIdentifier(await readJson(req))))
    } catch (cause) {
      return sendJson(res, 400, {
        error: 'manual-update-check-rejected',
        message: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }

  if (path === DEEPRUNNER_MARKET_PREVIEW_PATH) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method-not-allowed' })
    if (!contentTypeIsJson(req)) return sendJson(res, 415, { error: 'content-type-required' })
    try {
      await options.catalogReady
      const request = parseOperationRequest(await readJson(req))
      return sendJson(res, 200, options.operations.preview(request.pluginId, request.kind))
    } catch (cause) {
      return sendJson(res, 400, {
        error: 'operation-rejected',
        message: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }

  if (path === DEEPRUNNER_MARKET_OPERATIONS_PATH) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method-not-allowed' })
    if (!contentTypeIsJson(req)) return sendJson(res, 415, { error: 'content-type-required' })
    try {
      await options.catalogReady
      return sendJson(res, 202, options.operations.executePreview(parseExecuteRequest(await readJson(req))))
    } catch (cause) {
      return sendJson(res, 400, {
        error: 'operation-rejected',
        message: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }

  if (path.startsWith(`${DEEPRUNNER_MARKET_OPERATIONS_PATH}/`)) {
    const id = decodeURIComponent(path.slice(DEEPRUNNER_MARKET_OPERATIONS_PATH.length + 1))
    if (!OPERATION_ID_PATTERN.test(id)) return sendJson(res, 400, { error: 'invalid-operation-id' })
    if (req.method === 'GET') {
      const operation = options.operations.get(id)
      return operation === undefined
        ? sendJson(res, 404, { error: 'operation-not-found' })
        : sendJson(res, 200, operation)
    }
    if (req.method === 'DELETE') {
      const operation = options.operations.cancel(id)
      return operation === undefined
        ? sendJson(res, 404, { error: 'operation-not-found' })
        : sendJson(res, 200, operation)
    }
    return sendJson(res, 405, { error: 'method-not-allowed' })
  }

  if (path === DEEPRUNNER_MARKET_RESTART_PATH) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method-not-allowed' })
    if (options.operations.busy) return sendJson(res, 409, { error: 'operation-busy' })
    if (options.runtime === undefined) return sendJson(res, 503, { error: 'restart-unavailable' })
    sendJson(res, 202, { restarting: true })
    void options.runtime.requestRestart()
    return
  }

  sendJson(res, 404, { error: 'not-found' })
}
