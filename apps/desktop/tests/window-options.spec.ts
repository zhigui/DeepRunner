import { describe, expect, it } from 'vitest'
import type { DeepRunnerShellSpec } from '@deeprunner/contracts/internal/runtime'
import { deepRunnerWindowOptions } from '../src/window-options.js'

const base: DeepRunnerShellSpec = {
  generationId: 'generation-1',
  mode: 'advanced',
  themeSource: 'system',
  url: 'http://127.0.0.1:4010/',
  title: 'DeepRunner',
  width: 1280,
  height: 840,
  minWidth: 900,
  minHeight: 640,
  profiles: {
    currentName: 'deeprunner',
    currentDir: '/tmp/dsh/profiles/deeprunner',
    list: () => [],
    select: async () => {},
  },
  requestQuit: () => {},
}

describe('DeepRunner platform window options', () => {
  it('uses the system-owned macOS titlebar and opaque theme background', () => {
    const options = deepRunnerWindowOptions(base, 'darwin', false)
    expect(options.frame).toBe(true)
    expect(options.titleBarStyle).toBe('default')
    expect(options.backgroundColor).toBe('#f7f8fa')
    for (const key of [
      'trafficLightPosition',
      'titleBarOverlay',
      'transparent',
      'vibrancy',
      'visualEffectState',
    ]) expect(options).not.toHaveProperty(key)
  })

  it('uses Mica and native caption controls on Windows', () => {
    expect(deepRunnerWindowOptions(base, 'win32', true)).toMatchObject({
      titleBarStyle: 'hidden',
      backgroundMaterial: 'mica',
      titleBarOverlay: {
        color: '#00000000',
        symbolColor: '#f4f5f7',
        height: 40,
      },
    })
  })

  it('retains Linux window-manager decorations', () => {
    const options = deepRunnerWindowOptions(base, 'linux', false)
    expect(options.titleBarStyle).toBeUndefined()
    expect(options.transparent).toBeUndefined()
    expect(options.backgroundColor).toBe('#f7f8fa')
  })

  it('keeps compatibility mode free of custom materials', () => {
    const options = deepRunnerWindowOptions({ ...base, mode: 'compatibility' }, 'darwin', true)
    expect(options.vibrancy).toBeUndefined()
    expect(options.transparent).toBeUndefined()
  })
})
