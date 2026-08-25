import { BrowserWindow, dialog } from 'electron'
import type { DeepRunnerGeneration } from './generation-coordinator.js'
import type { DeepRunnerRecoveryModel } from './profile-recovery.js'
import {
  deepRunnerRecoveryHtml,
  parseDeepRunnerRecoveryAction,
  type DeepRunnerRecoveryAction,
} from './profile-recovery-page.js'

export interface DeepRunnerRecoveryWindowOptions {
  readonly model: DeepRunnerRecoveryModel
  readonly selectProfile: (name: string) => void
  readonly requestSafeMode: () => void
  readonly requestRestart: () => void
  readonly requestExit: () => void
}

/** Mount the minimal native recovery generation. */
export async function mountDeepRunnerRecoveryWindow(
  options: DeepRunnerRecoveryWindowOptions,
): Promise<DeepRunnerGeneration> {
  const window = new BrowserWindow({
    title: 'DeepRunner Recovery',
    width: 760,
    height: 700,
    minWidth: 620,
    minHeight: 520,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })
  let disposing = false
  let actionPending = false
  const invoke = (action: DeepRunnerRecoveryAction): void => {
    if (actionPending) return
    actionPending = true
    try {
      switch (action.kind) {
        case 'select': options.selectProfile(action.profile); options.requestRestart(); break
        case 'safe-mode': options.requestSafeMode(); options.requestRestart(); break
        case 'restart': options.requestRestart(); break
        case 'quit': options.requestExit(); break
      }
    } catch (cause) {
      actionPending = false
      dialog.showErrorBox(
        'DeepRunner Recovery',
        cause instanceof Error ? cause.message : String(cause),
      )
    }
  }
  window.webContents.on('will-navigate', (event, url) => {
    const action = parseDeepRunnerRecoveryAction(url)
    event.preventDefault()
    if (action !== undefined) invoke(action)
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.on('close', (event) => {
    if (disposing) return
    event.preventDefault()
    invoke({ kind: 'quit' })
  })
  window.once('ready-to-show', () => { window.show() })
  const html = deepRunnerRecoveryHtml(options.model)
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  return {
    dispose: async () => {
      disposing = true
      if (!window.isDestroyed()) window.destroy()
    },
  }
}
