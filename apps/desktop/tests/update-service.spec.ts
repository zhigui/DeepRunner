import { EventEmitter } from 'node:events'
import type { AppUpdater, UpdateInfo } from 'electron-updater'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const showMessageBox = vi.fn()
const openExternal = vi.fn()

vi.mock('electron', () => ({
  app: { isPackaged: true },
  dialog: { showMessageBox },
  shell: { openExternal },
}))
vi.mock('electron-updater', () => ({
  default: { autoUpdater: {} },
}))

const { DeepRunnerUpdateService } = await import('../src/update-service.js')

function updateInfo(version = '1.1.0'): UpdateInfo {
  return {
    version,
    files: [{ url: 'DeepRunner.zip', sha512: 'checksum' }],
    releaseDate: '2026-08-24T00:00:00.000Z',
  }
}

class FakeUpdater extends EventEmitter {
  autoDownload = true
  autoInstallOnAppQuit = false
  autoRunAppAfterInstall = false
  disableWebInstaller = false
  logger = null
  currentVersion = { version: '1.0.0' }
  checkForUpdates = vi.fn()
  downloadUpdate = vi.fn(async () => ['/tmp/update'])
  quitAndInstall = vi.fn()
}

function service(updater: FakeUpdater, progress: number[] = []): DeepRunnerUpdateService {
  return new DeepRunnerUpdateService({
    updater: updater as unknown as AppUpdater,
    isPackaged: true,
    setProgress: value => { progress.push(value) },
  })
}

describe('electron updater service', () => {
  beforeEach(() => {
    showMessageBox.mockReset()
    openExternal.mockReset()
  })

  it('configures safe application-controlled downloads', () => {
    const updater = new FakeUpdater()
    service(updater)
    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(true)
    expect(updater.autoRunAppAfterInstall).toBe(true)
    expect(updater.disableWebInstaller).toBe(true)
  })

  it('removes singleton updater listeners when a runtime generation is disposed', () => {
    const updater = new FakeUpdater()
    const updates = service(updater)
    expect(updater.listenerCount('error')).toBe(1)
    expect(updater.listenerCount('download-progress')).toBe(1)
    updates.dispose()
    expect(updater.listenerCount('error')).toBe(0)
    expect(updater.listenerCount('download-progress')).toBe(0)
  })

  it('reports that the packaged application is current', async () => {
    const updater = new FakeUpdater()
    updater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: false,
      updateInfo: updateInfo('1.0.0'),
      versionInfo: updateInfo('1.0.0'),
    })
    await service(updater).check(true)
    expect(showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      message: 'DeepRunner is up to date.',
      detail: 'Current version: 1.0.0',
    }))
  })

  it('downloads and installs an accepted update without opening an installer', async () => {
    const updater = new FakeUpdater()
    const progress: number[] = []
    updater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: updateInfo(),
      versionInfo: updateInfo(),
    })
    showMessageBox
      .mockResolvedValueOnce({ response: 0 })
      .mockResolvedValueOnce({ response: 0 })
    const updates = service(updater, progress)
    updater.emit('download-progress', { percent: 42 } as never)

    await updates.check(true)

    expect(updater.downloadUpdate).toHaveBeenCalledOnce()
    expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true)
    expect(progress).toEqual([0.42, 0, -1])
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('leaves a downloaded update for automatic installation on normal quit', async () => {
    const updater = new FakeUpdater()
    updater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: updateInfo(),
      versionInfo: updateInfo(),
    })
    showMessageBox
      .mockResolvedValueOnce({ response: 0 })
      .mockResolvedValueOnce({ response: 1 })

    await service(updater).check(true)

    expect(updater.downloadUpdate).toHaveBeenCalledOnce()
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
    expect(updater.autoInstallOnAppQuit).toBe(true)
  })
})
