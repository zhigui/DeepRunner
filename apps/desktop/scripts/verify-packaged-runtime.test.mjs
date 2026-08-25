import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  REQUIRED_ARCHIVE_ENTRIES,
  REQUIRED_PHYSICAL_PACKAGE_EXPORTS,
  resolveAppArgument,
  resolvePackagedAsarPath,
  verifyPackagedRuntime,
} from './verify-packaged-runtime.mjs'

function context(platform) {
  return {
    appOutDir: '/build',
    electronPlatformName: platform,
    packager: { appInfo: { productFilename: 'DeepRunner' } },
  }
}

describe('DeepRunner packaged runtime verification', () => {
  it('finds a relative application path from an ancestor workspace', () => {
    expect(resolveAppArgument('package.json', join(process.cwd(), 'nested', 'workspace')))
      .toBe(join(process.cwd(), 'package.json'))
  })

  it('resolves platform-specific ASAR paths', () => {
    expect(resolvePackagedAsarPath(context('darwin')))
      .toBe(join('/build', 'DeepRunner.app', 'Contents', 'Resources', 'app.asar'))
    expect(resolvePackagedAsarPath(context('win32'))).toBe(join('/build', 'resources', 'app.asar'))
    expect(() => resolvePackagedAsarPath(context('mas'))).toThrow(/does not support/u)
  })

  it('accepts a complete physical production closure', () => {
    const runtime = context('darwin')
    const unpackedRoot = `${resolvePackagedAsarPath(runtime)}.unpacked`
    const resolvePackage = vi.fn(specifier => join(unpackedRoot, 'resolved', specifier))
    verifyPackagedRuntime(
      runtime,
      () => REQUIRED_ARCHIVE_ENTRIES.map(entry => `/${entry}`),
      () => true,
      resolvePackage,
    )
    expect(resolvePackage.mock.calls.map(([specifier]) => specifier))
      .toEqual(REQUIRED_PHYSICAL_PACKAGE_EXPORTS)
  })

  it('rejects a missing physical mirror and duplicate Electron runtime', () => {
    const runtime = context('linux')
    const missing = REQUIRED_ARCHIVE_ENTRIES[0]
    expect(() => verifyPackagedRuntime(
      runtime,
      () => REQUIRED_ARCHIVE_ENTRIES,
      filename => !filename.endsWith(missing),
      specifier => join(`${resolvePackagedAsarPath(runtime)}.unpacked`, specifier),
    )).toThrow(/missing mirrored entries/u)
    expect(() => verifyPackagedRuntime(
      runtime,
      () => [...REQUIRED_ARCHIVE_ENTRIES, 'node_modules/electron/package.json'],
      () => true,
      specifier => join(`${resolvePackagedAsarPath(runtime)}.unpacked`, specifier),
    )).toThrow(/duplicate node_modules\/electron/u)
  })
})
