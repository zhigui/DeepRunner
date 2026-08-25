import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mkdtempSync } from 'node:fs'
import { composeEntries } from '@deepseek-ai/dsh-app-boot'
import { setDeepRunnerPluginDisabled } from '@deeprunner/plugin-market'
import { describe, expect, it } from 'vitest'
import {
  deepRunnerBundleList,
  ensureDeepRunnerProfile,
  importDeepRunnerModuleFrom,
  prepareDeepRunnerProfile,
} from '../src/profile.js'

describe('DeepRunner profile composition', () => {
  it('keeps the official Web prefix and third-party bundle order', () => {
    expect(deepRunnerBundleList([
      'third-party-a',
      '@deepseek-ai/dsh-web-app',
      '@deeprunner/desktop-plugin',
      '@deeprunner/plugin-market',
      '@deepseek-ai/dsh-base',
      'third-party-b',
    ])).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      'third-party-a',
      'third-party-b',
    ])
  })

  it('imports a Profile module through its package anchor', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'deeprunner-profile-import-'))
    const modulePath = join(dir, 'third-party.mjs')
    const anchorPath = join(dir, 'package.json')
    writeFileSync(modulePath, 'export default "profile bundle"\n', 'utf8')
    writeFileSync(anchorPath, '{}\n', 'utf8')
    const loaded = await importDeepRunnerModuleFrom(
      pathToFileURL(modulePath).href,
      pathToFileURL(anchorPath).href,
    ) as { default: string }
    expect(loaded.default).toBe('profile bundle')
  })

  it('safe mode bypasses a broken Profile manifest and user patches', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'deeprunner-safe-profile-'))
    const profileDir = join(homeDir, 'profiles', 'deeprunner')
    mkdirSync(profileDir, { recursive: true })
    writeFileSync(join(profileDir, 'package.json'), '{ invalid manifest', 'utf8')
    writeFileSync(join(profileDir, 'cordis.patch.yml'), ': invalid profile yaml', 'utf8')
    writeFileSync(join(homeDir, 'cordis.patch.yml'), ': invalid home yaml', 'utf8')

    const prepared = prepareDeepRunnerProfile(homeDir, undefined, { safeMode: true })
    const ids = composeEntries([prepared.patches]).map(row => row.id)
    expect(prepared.profile.layers.map(layer => layer.packageName)).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
    ])
    expect(ids).toContain('webserver')
    expect(ids).toContain('deeprunner-shell')
    expect(ids).not.toContain('deeprunner-plugin-market')
  })

  it('composes the plugin market in an ordinary generation', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'deeprunner-market-profile-'))
    const prepared = prepareDeepRunnerProfile(homeDir)
    const ids = composeEntries([prepared.patches]).map(row => row.id)
    expect(ids).toContain('deeprunner-shell')
    expect(ids).toContain('deeprunner-plugin-market')
  })

  it('skips a manually disabled bundle without removing it from the Profile', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'deeprunner-disabled-profile-'))
    const profileDir = ensureDeepRunnerProfile(homeDir)
    const packageDir = join(profileDir, 'node_modules', 'fixture-plugin')
    mkdirSync(packageDir, { recursive: true })
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
      name: 'fixture-plugin',
      version: '1.0.0',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    writeFileSync(join(packageDir, 'cordis.patch.yml'), '- id: fixture-plugin-row\n  config: {}\n')
    const manifestPath = join(profileDir, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      dependencies?: Record<string, string>
      dsh?: { profile?: { bundles?: string[] } }
    }
    manifest.dependencies = { ...manifest.dependencies, 'fixture-plugin': '1.0.0' }
    manifest.dsh = { profile: { bundles: [...(manifest.dsh?.profile?.bundles ?? []), 'fixture-plugin'] } }
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    setDeepRunnerPluginDisabled(profileDir, 'fixture-plugin', true)

    const prepared = prepareDeepRunnerProfile(homeDir)
    expect(prepared.profile.layers.map(layer => layer.packageName)).toContain('fixture-plugin')
    expect(prepared.skippedPlugins).toContainEqual({
      packageName: 'fixture-plugin',
      reason: 'Disabled by the user',
    })
    expect(composeEntries([prepared.patches]).map(row => row.id)).not.toContain('fixture-plugin-row')
  })
})
