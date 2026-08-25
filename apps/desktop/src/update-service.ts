import { app, dialog, shell } from 'electron'
import electronUpdater, {
  type AppUpdater,
  type ProgressInfo,
  type UpdateInfo,
} from 'electron-updater'

const { autoUpdater } = electronUpdater
const RELEASES_URL = 'https://github.com/zhigui/DeepRunner/releases'

export interface DeepRunnerUpdateServiceOptions {
  readonly updater?: AppUpdater
  readonly isPackaged?: boolean
  readonly setProgress?: (progress: number) => void
}

function detail(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function releaseNotesUrl(info: UpdateInfo): string {
  return `${RELEASES_URL}/tag/v${encodeURIComponent(info.version)}`
}

/** Application-facing update flow backed by electron-builder's platform updaters. */
export class DeepRunnerUpdateService {
  private readonly updater: AppUpdater
  private checking = false
  private readonly onError = (cause: Error): void => {
    process.stderr.write(`deeprunner updater error: ${detail(cause)}\n`)
  }
  private readonly onProgress = (progress: ProgressInfo): void => {
    this.reportProgress(progress)
  }

  constructor(private readonly options: DeepRunnerUpdateServiceOptions = {}) {
    this.updater = options.updater ?? autoUpdater
    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = true
    this.updater.autoRunAppAfterInstall = true
    this.updater.disableWebInstaller = true
    this.updater.logger = {
      info: message => { process.stderr.write(`deeprunner updater: ${String(message)}\n`) },
      warn: message => { process.stderr.write(`deeprunner updater warning: ${String(message)}\n`) },
      error: message => { process.stderr.write(`deeprunner updater error: ${String(message)}\n`) },
    }
    this.updater.on('error', this.onError)
    this.updater.on('download-progress', this.onProgress)
  }

  dispose(): void {
    this.updater.off('error', this.onError)
    this.updater.off('download-progress', this.onProgress)
    this.options.setProgress?.(-1)
  }

  async check(interactive = true): Promise<void> {
    if (this.checking) return
    if (!(this.options.isPackaged ?? app.isPackaged)) {
      if (interactive) await dialog.showMessageBox({
        type: 'info',
        title: 'DeepRunner Updates',
        message: 'Updates are available in packaged builds only.',
      })
      return
    }
    this.checking = true
    try {
      const result = await this.updater.checkForUpdates()
      if (result === null) throw new Error('the update provider is not configured')
      if (!result.isUpdateAvailable) {
        if (interactive) await dialog.showMessageBox({
          type: 'info',
          title: 'DeepRunner Updates',
          message: 'DeepRunner is up to date.',
          detail: `Current version: ${this.updater.currentVersion.version}`,
        })
        return
      }
      await this.offer(result.updateInfo)
    } catch (cause) {
      if (interactive) await dialog.showMessageBox({
        type: 'error',
        title: 'Update failed',
        message: 'DeepRunner could not complete the update.',
        detail: detail(cause),
      })
      else process.stderr.write(`deeprunner: background update failed: ${detail(cause)}\n`)
    } finally {
      this.options.setProgress?.(-1)
      this.checking = false
    }
  }

  private async offer(info: UpdateInfo): Promise<void> {
    const choice = await dialog.showMessageBox({
      type: 'info',
      title: 'DeepRunner Update',
      message: `DeepRunner ${info.version} is available.`,
      detail: 'DeepRunner can download and verify the update in the background.',
      buttons: ['Download update', 'Release notes', 'Later'],
      defaultId: 0,
      cancelId: 2,
    })
    if (choice.response === 1) {
      await shell.openExternal(releaseNotesUrl(info))
      return
    }
    if (choice.response !== 0) return

    this.options.setProgress?.(0)
    await this.updater.downloadUpdate()
    const install = await dialog.showMessageBox({
      type: 'info',
      title: 'Update ready',
      message: `DeepRunner ${info.version} is ready to install.`,
      detail: 'Restart now to finish updating, or install it automatically the next time DeepRunner exits.',
      buttons: ['Restart and update', 'Install on quit'],
      defaultId: 0,
      cancelId: 1,
    })
    if (install.response === 0) this.updater.quitAndInstall(true, true)
  }

  private reportProgress(progress: ProgressInfo): void {
    const ratio = Number.isFinite(progress.percent)
      ? Math.max(0, Math.min(1, progress.percent / 100))
      : 0
    this.options.setProgress?.(ratio)
  }
}
