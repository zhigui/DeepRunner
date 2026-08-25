import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  bindDeepRunnerDshHome,
  resolveDeepRunnerDshHome,
} from '../src/dsh-home.js'

describe('DeepRunner DSH home', () => {
  it('lives below Electron userData', () => {
    expect(resolveDeepRunnerDshHome('/private/product-state'))
      .toBe(resolve('/private/product-state/dsh-home'))
  })

  it('rejects a relative userData directory', () => {
    expect(() => resolveDeepRunnerDshHome('product-state'))
      .toThrow('DeepRunner userData directory must be absolute')
  })

  it('replaces an ambient shared DSH_HOME for every upstream consumer', () => {
    const environment = { DSH_HOME: '/Users/example/.dsh' }
    const homeDir = bindDeepRunnerDshHome('/private/product-state', environment)

    expect(homeDir).toBe(resolve('/private/product-state/dsh-home'))
    expect(environment.DSH_HOME).toBe(homeDir)
  })
})
