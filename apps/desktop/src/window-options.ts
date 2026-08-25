import type { BrowserWindowConstructorOptions } from 'electron'
import type {
  DeepRunnerPlatform,
  DeepRunnerShellSpec,
} from '@deeprunner/contracts/internal/runtime'

export const DEEPRUNNER_TITLEBAR_HEIGHT = {
  win32: 40,
} as const

const SECURE_WEB_PREFERENCES: Electron.WebPreferences = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
}

/** Resolve one secure, platform-native BrowserWindow configuration. */
export function deepRunnerWindowOptions(
  spec: DeepRunnerShellSpec,
  platform: DeepRunnerPlatform,
  dark: boolean,
): BrowserWindowConstructorOptions {
  const options: BrowserWindowConstructorOptions = {
    title: spec.title,
    width: spec.width,
    height: spec.height,
    minWidth: spec.minWidth,
    minHeight: spec.minHeight,
    show: false,
    backgroundColor: dark ? '#17191d' : '#f7f8fa',
    webPreferences: SECURE_WEB_PREFERENCES,
  }
  if (spec.mode !== 'advanced') {
    return platform === 'win32' ? { ...options, autoHideMenuBar: true } : options
  }
  if (platform === 'darwin') {
    // Keep the system-owned titlebar. macOS now owns its theme, traffic lights,
    // safe area, drag behavior, and accessibility without renderer compensation.
    return {
      ...options,
      frame: true,
      titleBarStyle: 'default',
    }
  }
  if (platform === 'win32') {
    return {
      ...options,
      autoHideMenuBar: true,
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#00000000',
        symbolColor: dark ? '#f4f5f7' : '#343840',
        height: DEEPRUNNER_TITLEBAR_HEIGHT.win32,
      },
      backgroundColor: '#00000000',
      backgroundMaterial: 'mica',
      hasShadow: true,
      roundedCorners: true,
      thickFrame: true,
    }
  }
  // Linux window-manager behavior varies; retain its native decorations.
  return options
}
