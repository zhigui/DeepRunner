import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  DeepRunnerMarketHotActivationService,
  parseDeepRunnerHotPatch,
} from '../src/hot-activation.js'

describe('DeepRunner market hot activation', () => {
  it('accepts only plain top-level insert rows', () => {
    expect(parseDeepRunnerHotPatch(`
- insert:
    - id: fixture
      name: fixture-plugin
`)).toEqual([{ id: 'fixture', name: 'fixture-plugin' }])
    expect(parseDeepRunnerHotPatch(`
- insert:
    - id: fixture
      name: fixture-plugin
      config: { unsafe: true }
`)).toBeUndefined()
    expect(parseDeepRunnerHotPatch(`
- id: fixture
  disable: true
`)).toBeUndefined()
  })

  it('mounts an installed simple patch and disposes its current-generation handle', async () => {
    const profileDir = mkdtempSync(join(tmpdir(), 'deeprunner-hot-'))
    const packageDir = join(profileDir, 'node_modules', 'fixture-plugin')
    mkdirSync(packageDir, { recursive: true })
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    writeFileSync(join(packageDir, 'cordis.patch.yml'), `
- insert:
    - id: fixture
      name: fixture-plugin
`)
    const dispose = vi.fn(async () => {})
    const plugin = vi.fn(() => ({ await: async () => {}, dispose }))
    const service = new DeepRunnerMarketHotActivationService({
      plugin,
      loader: { entries: function* () {} },
      logger: { info: vi.fn(), warn: vi.fn() },
    } as never, profileDir)

    await expect(service.apply('install', 'fixture-plugin')).resolves.toEqual({ status: 'live' })
    const config = plugin.mock.calls[0]?.[1] as { path: string }
    expect(JSON.parse(readFileSync(new URL(config.path), 'utf8'))).toEqual([{
      id: 'market-fixture', name: 'fixture-plugin',
    }])
    await expect(service.apply('disable', 'fixture-plugin')).resolves.toEqual({ status: 'live' })
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('falls back to restart for complex patches and unmatched live entries', async () => {
    const profileDir = mkdtempSync(join(tmpdir(), 'deeprunner-hot-'))
    const packageDir = join(profileDir, 'node_modules', 'fixture-plugin')
    mkdirSync(packageDir, { recursive: true })
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    writeFileSync(join(packageDir, 'cordis.patch.yml'), `
- insert:
    - id: fixture
      name: fixture-plugin
      config: { value: true }
`)
    const service = new DeepRunnerMarketHotActivationService({
      plugin: vi.fn(),
      loader: { entries: function* () {} },
      logger: { info: vi.fn(), warn: vi.fn() },
    } as never, profileDir)

    await expect(service.apply('install', 'fixture-plugin')).resolves.toMatchObject({
      status: 'restart-required',
    })
    await expect(service.apply('disable', 'fixture-plugin')).resolves.toMatchObject({
      status: 'restart-required',
    })
  })
})
