import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  isDeepRunnerRendererBootReport,
  type DeepRunnerRendererBootReport,
} from '@deeprunner/contracts'
export { DEEPRUNNER_RENDERER_BOOT_PATH } from './transport-paths.js'

const MAX_REPORT_BYTES = 16 * 1024
const MAX_FAILED_PLUGINS = 64

async function readJson(req: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    size += bytes.byteLength
    if (size > limit) throw new Error('request body is too large')
    chunks.push(bytes)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function isBoundedReport(value: unknown): value is DeepRunnerRendererBootReport {
  if (!isDeepRunnerRendererBootReport(value)) return false
  if (value.generationId.length > 128) return false
  if (value.status === 'healthy') return true
  return value.plugins.length <= MAX_FAILED_PLUGINS
    && value.plugins.every(plugin => plugin.length > 0 && plugin.length <= 512)
    && (value.error === undefined || value.error.length <= 12 * 1024)
}

function finish(res: ServerResponse, statusCode: number): void {
  res.statusCode = statusCode
  res.end()
}

/** Validate and forward the terminal Client Loader outcome for one main window. */
export async function handleDeepRunnerRendererBootRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  expectedGenerationId: string,
  report: (value: DeepRunnerRendererBootReport) => void,
): Promise<void> {
  if (req.method !== 'POST') return finish(res, 405)
  if (req.headers.origin !== expectedOrigin) return finish(res, 403)
  if (req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    return finish(res, 415)
  }
  try {
    const value = await readJson(req, MAX_REPORT_BYTES)
    if (!isBoundedReport(value) || value.generationId !== expectedGenerationId) return finish(res, 400)
    report(value)
    finish(res, 204)
  } catch {
    finish(res, 400)
  }
}
