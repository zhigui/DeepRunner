import { describe, expect, it } from 'vitest'
import {
  packagedDependencyPath,
  unpackedAsarPath,
} from '../src/packaged-runtime-path.js'

describe('DeepRunner packaged runtime paths', () => {
  it('maps logical ASAR paths to physical unpacked paths on both separator styles', () => {
    expect(unpackedAsarPath('/Applications/DeepRunner.app/Contents/Resources/app.asar/lib/bin.js'))
      .toBe('/Applications/DeepRunner.app/Contents/Resources/app.asar.unpacked/lib/bin.js')
    expect(unpackedAsarPath('C:\\DeepRunner\\resources\\app.asar\\lib\\bin.js'))
      .toBe('C:\\DeepRunner\\resources\\app.asar.unpacked\\lib\\bin.js')
    expect(unpackedAsarPath('/workspace/lib/bin.js')).toBe('/workspace/lib/bin.js')
  })

  it('resolves package entries in development and rejects escaping paths', () => {
    expect(packagedDependencyPath(import.meta.url, '@deepseek-ai/dsh/package.json'))
      .toMatch(/node_modules[\\/]@deepseek-ai[\\/]dsh[\\/]package\.json$/u)
    expect(() => packagedDependencyPath(import.meta.url, '../package.json')).toThrow(/relative POSIX path/u)
    expect(() => packagedDependencyPath(import.meta.url, '@deepseek-ai')).toThrow(/relative POSIX path/u)
    expect(() => packagedDependencyPath(import.meta.url, 'pnpm\\bin\\pnpm.mjs')).toThrow(/relative POSIX path/u)
  })
})
