import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  cleanPackagedSmokeEnvironment,
  extractPackagedSmokeReport,
  resolvePackagedAppLayout,
  resolveSmokeAppArgument,
} from './packaged-smoke-helpers.mjs'

describe('packaged smoke helpers', () => {
  it('resolves all supported application layouts', () => {
    expect(resolvePackagedAppLayout('/dist/DeepRunner.app', 'darwin')).toMatchObject({
      executablePath: join(resolve('/dist/DeepRunner.app'), 'Contents', 'MacOS', 'DeepRunner'),
      unpackedRoot: join(resolve('/dist/DeepRunner.app'), 'Contents', 'Resources', 'app.asar.unpacked'),
    })
    expect(resolvePackagedAppLayout('/dist/win-unpacked', 'win32').executablePath)
      .toBe(join(resolve('/dist/win-unpacked'), 'DeepRunner.exe'))
    expect(resolvePackagedAppLayout('/dist/linux-unpacked', 'linux').executablePath)
      .toBe(join(resolve('/dist/linux-unpacked'), 'deeprunner'))
    expect(() => resolvePackagedAppLayout('/dist/app', 'freebsd')).toThrow(/does not support/u)
  })

  it('finds relative artifacts from an ancestor workspace', () => {
    const root = resolve(process.cwd())
    expect(resolveSmokeAppArgument('package.json', join(root, 'nested', 'workspace')))
      .toBe(join(root, 'package.json'))
  })

  it('removes host Node injection and developer PATH entries', () => {
    const environment = cleanPackagedSmokeEnvironment({
      HOME: '/home/smoke',
      PATH: '/developer/node/bin',
      NODE_OPTIONS: '--require developer-hook',
      ELECTRON_RUN_AS_NODE: 'inherited',
      npm_config_runtime: 'node',
    }, 'darwin')
    expect(environment).toEqual({ HOME: '/home/smoke', PATH: '/usr/bin:/bin' })
  })

  it('accepts only a prefixed terminal renderer report', () => {
    const prefix = 'SMOKE '
    expect(extractPackagedSmokeReport(
      `noise\n${prefix}{"status":"healthy","generationId":"one"}\n`,
      prefix,
    )).toEqual({ status: 'healthy', generationId: 'one' })
    expect(extractPackagedSmokeReport(`${prefix}{"status":"healthy"}\n`, prefix)).toBeUndefined()
    expect(extractPackagedSmokeReport('SMOKE not-json\n', prefix)).toBeUndefined()
  })
})
