import { describe, expect, it } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { deepRunnerRendererUrl } from '../src/index.js'
import { deepRunnerRendererBootReport } from '../src/client/boot-health.js'
import { inject as clientInject } from '../src/client/index.js'
import { parseDeepRunnerClientEnvironment } from '../src/client/environment.js'
import { DEEPRUNNER_CHROME_STYLES } from '../src/client/styles.js'
import { handleDeepRunnerRendererBootRequest } from '../src/renderer-boot.js'
import { handleDeepRunnerThemeSyncRequest } from '../src/theme-transport.js'

function request(body: unknown, origin = 'http://127.0.0.1:4010'): IncomingMessage {
  return Object.assign(Readable.from([JSON.stringify(body)]), {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
  }) as unknown as IncomingMessage
}

function response(): {
  readonly value: ServerResponse
  readonly status: () => number
  readonly json: () => unknown
} {
  const chunks: Buffer[] = []
  const target = {
    statusCode: 200,
    setHeader: () => target,
    end: (chunk?: Uint8Array) => {
      if (chunk !== undefined) chunks.push(Buffer.from(chunk))
      return target
    },
  }
  return {
    value: target as unknown as ServerResponse,
    status: () => target.statusCode,
    json: () => JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
  }
}

describe('DeepRunner desktop plugin', () => {
  it('declares the services used by nested client features', () => {
    expect(clientInject).toContain('sessions')
  })

  it('round-trips the Host-owned client environment', () => {
    const url = new URL(deepRunnerRendererUrl(4010, 'compatibility', 'darwin', 'generation-1'))
    expect(parseDeepRunnerClientEnvironment(url.search)).toEqual({
      mode: 'compatibility',
      platform: 'darwin',
      generationId: 'generation-1',
      themeSource: 'system',
    })
  })

  it('rejects invalid environment markers', () => {
    expect(() => parseDeepRunnerClientEnvironment('?deeprunner-mode=other')).toThrow()
  })

  it('leaves native window chrome free of renderer compensation', () => {
    expect(DEEPRUNNER_CHROME_STYLES).toMatch(/body \{.*overflow: hidden/)
    expect(DEEPRUNNER_CHROME_STYLES).not.toContain('#deeprunner-titlebar')
    expect(DEEPRUNNER_CHROME_STYLES).not.toMatch(/#root \{[^}]*margin-top/)
    expect(DEEPRUNNER_CHROME_STYLES).not.toContain('data-deeprunner-platform="darwin"')
    expect(DEEPRUNNER_CHROME_STYLES).not.toContain('-webkit-app-region')
    expect(DEEPRUNNER_CHROME_STYLES).not.toContain('traffic-light')
    expect(DEEPRUNNER_CHROME_STYLES).not.toContain('data-sidebar-collapsed')
  })

  it('reports the complete Client Loader outcome', async () => {
    expect(await deepRunnerRendererBootReport({
      await: async () => {},
      entries: () => [{ options: { name: 'healthy' }, fiber: { state: 2 } }],
    }, 'generation-1')).toEqual({ status: 'healthy', generationId: 'generation-1' })

    expect(await deepRunnerRendererBootReport({
      await: async () => { throw new Error('loader failed') },
      entries: () => [{ options: { name: 'broken' }, fiber: { state: 3 } }],
    }, 'generation-2')).toEqual({
      status: 'failed',
      generationId: 'generation-2',
      plugins: ['broken'],
      error: 'loader failed',
    })
  })

  it('accepts only the current generation renderer-health report', async () => {
    const accepted: unknown[] = []
    const success = response()
    await handleDeepRunnerRendererBootRequest(
      request({ status: 'healthy', generationId: 'generation-1' }),
      success.value,
      'http://127.0.0.1:4010',
      'generation-1',
      value => { accepted.push(value) },
    )
    expect(success.status()).toBe(204)
    expect(accepted).toEqual([{ status: 'healthy', generationId: 'generation-1' }])

    const stale = response()
    await handleDeepRunnerRendererBootRequest(
      request({ status: 'healthy', generationId: 'generation-0' }),
      stale.value,
      'http://127.0.0.1:4010',
      'generation-1',
      value => { accepted.push(value) },
    )
    expect(stale.status()).toBe(400)
    expect(accepted).toHaveLength(1)
  })

  it('syncs only bounded same-origin native theme preferences', async () => {
    const accepted: string[] = []
    const success = response()
    await handleDeepRunnerThemeSyncRequest(
      request({ source: 'dark' }),
      success.value,
      'http://127.0.0.1:4010',
      source => { accepted.push(source) },
    )
    expect(success.status()).toBe(204)
    expect(accepted).toEqual(['dark'])

    const invalid = response()
    await handleDeepRunnerThemeSyncRequest(
      request({ source: 'sepia' }),
      invalid.value,
      'http://127.0.0.1:4010',
      source => { accepted.push(source) },
    )
    expect(invalid.status()).toBe(400)

    const forbidden = response()
    await handleDeepRunnerThemeSyncRequest(
      request({ source: 'light' }, 'http://example.com'),
      forbidden.value,
      'http://127.0.0.1:4010',
      source => { accepted.push(source) },
    )
    expect(forbidden.status()).toBe(403)
    expect(accepted).toEqual(['dark'])
  })
})
