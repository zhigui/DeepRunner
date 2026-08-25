import { existsSync, mkdtempSync, readFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  readDeepRunnerAppearance,
  writeDeepRunnerAppearance,
} from '../src/appearance.js'

describe('DeepRunner appearance state', () => {
  it('defaults to the system theme without creating state', () => {
    const root = mkdtempSync(join(tmpdir(), 'deeprunner-appearance-'))
    const statePath = join(root, 'appearance', 'state.json')
    expect(readDeepRunnerAppearance(statePath)).toEqual({ version: 1, themeSource: 'system' })
    expect(existsSync(statePath)).toBe(false)
  })

  it('atomically persists an explicit theme source', () => {
    const root = mkdtempSync(join(tmpdir(), 'deeprunner-appearance-'))
    const statePath = join(root, 'appearance', 'state.json')
    expect(writeDeepRunnerAppearance(statePath, 'dark')).toEqual({ version: 1, themeSource: 'dark' })
    expect(readDeepRunnerAppearance(statePath)).toEqual({ version: 1, themeSource: 'dark' })
    expect(JSON.parse(readFileSync(statePath, 'utf8'))).toEqual({ version: 1, themeSource: 'dark' })
  })

  it('does not follow a symlinked state file', () => {
    const root = mkdtempSync(join(tmpdir(), 'deeprunner-appearance-'))
    const target = join(root, 'target.json')
    const statePath = join(root, 'state.json')
    writeDeepRunnerAppearance(target, 'dark')
    symlinkSync(target, statePath)
    expect(readDeepRunnerAppearance(statePath)).toEqual({ version: 1, themeSource: 'system' })
  })
})
