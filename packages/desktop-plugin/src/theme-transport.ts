import type { IncomingMessage, ServerResponse } from 'node:http'
import type { DeepRunnerThemeSource } from '@deeprunner/contracts/internal/runtime'
export { DEEPRUNNER_THEME_SYNC_PATH } from './transport-paths.js'

const MAX_THEME_BYTES = 128

function finish(res: ServerResponse, statusCode: number): void {
  res.statusCode = statusCode
  res.end()
}

function parseThemeSource(value: unknown): DeepRunnerThemeSource | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const source = (value as { source?: unknown }).source
  return source === 'system' || source === 'light' || source === 'dark' ? source : undefined
}

/** Accept one same-origin renderer theme preference and forward it to native chrome. */
export async function handleDeepRunnerThemeSyncRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  sync: (source: DeepRunnerThemeSource) => void,
): Promise<void> {
  if (req.method !== 'POST') return finish(res, 405)
  if (req.headers.origin !== expectedOrigin) return finish(res, 403)
  if (req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    return finish(res, 415)
  }
  const chunks: Buffer[] = []
  let size = 0
  try {
    for await (const chunk of req) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
      size += bytes.byteLength
      if (size > MAX_THEME_BYTES) return finish(res, 413)
      chunks.push(bytes)
    }
    const source = parseThemeSource(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown)
    if (source === undefined) return finish(res, 400)
    sync(source)
    finish(res, 204)
  } catch {
    finish(res, 400)
  }
}
