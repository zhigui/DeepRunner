import { app } from 'electron'
import { ElectronDeepRunnerRuntime } from './electron-runtime.js'
import {
  DeepRunnerGenerationCoordinator,
  type DeepRunnerGeneration,
} from './generation-coordinator.js'
import { installDeepRunnerShutdownRequests } from './shutdown-requests.js'
import { deepRunnerDeepLinkFromArgv, parseDeepRunnerDeepLink } from './deep-link.js'
import {
  formatDeepRunnerPackagedSmokeResult,
  isDeepRunnerPackagedSmoke,
} from './packaged-smoke.js'

export interface DeepRunnerDesktopBootstrap {
  boot(
    runtime: ElectronDeepRunnerRuntime,
    requestExit: (code: number) => void,
  ): Promise<DeepRunnerGeneration>
  recover?(
    cause: unknown,
    controls: {
      readonly requestRestart: () => void
      readonly requestExit: (code: number) => void
    },
  ): Promise<'relaunch' | DeepRunnerGeneration>
}

/**
 * Start the Electron-owned lifecycle around a supplied M0 Host bootstrap.
 * The concrete DSH app-boot adapter is intentionally the next implementation step.
 */
export async function startDeepRunnerDesktop(bootstrap: DeepRunnerDesktopBootstrap): Promise<void> {
  app.setName('DeepRunner')
  let pendingPluginId = deepRunnerDeepLinkFromArgv(process.argv)?.pluginId
  let runtime: ElectronDeepRunnerRuntime | undefined
  const acceptDeepLink = (value: string): void => {
    const link = parseDeepRunnerDeepLink(value)
    if (link === undefined) return
    pendingPluginId = link.pluginId
    runtime?.openMarketPlugin(link.pluginId)
  }
  app.on('open-url', (event, url) => {
    event.preventDefault()
    acceptDeepLink(url)
  })
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }

  let removeShutdownRequests = (): void => {}
  const packagedSmoke = isDeepRunnerPackagedSmoke(process.env)
  const coordinator = new DeepRunnerGenerationCoordinator({
    prepareToQuit: () => {
      removeShutdownRequests()
      runtime?.prepareToQuit()
    },
    relaunch: () => { app.relaunch() },
    exit: code => { app.exit(code) },
  })
  runtime = new ElectronDeepRunnerRuntime(
    async () => { await coordinator.requestExit(0, { relaunch: true }) },
    report => {
      if (!packagedSmoke) return
      process.stdout.write(formatDeepRunnerPackagedSmokeResult(report), () => {
        void coordinator.requestExit(report.status === 'healthy' ? 0 : 1)
      })
    },
  )
  removeShutdownRequests = installDeepRunnerShutdownRequests(
    process,
    app,
    code => { void coordinator.requestExit(code) },
  )

  app.on('second-instance', (_event, commandLine) => {
    const link = deepRunnerDeepLinkFromArgv(commandLine)
    if (link !== undefined) acceptDeepLink(`deeprunner://market/plugin/${link.pluginId}`)
    runtime?.show()
  })
  app.on('activate', () => { runtime?.show() })

  await app.whenReady()
  if (app.isPackaged) app.setAsDefaultProtocolClient('deeprunner')
  try {
    await coordinator.start(async () => bootstrap.boot(
      runtime,
      code => { void coordinator.requestExit(code) },
    ))
    if (pendingPluginId !== undefined) runtime.openMarketPlugin(pendingPluginId)
  } catch (cause) {
    if (bootstrap.recover === undefined) {
      await coordinator.requestExit(1)
      throw cause
    }
    const recovery = await bootstrap.recover(cause, {
      requestRestart: () => { void coordinator.requestExit(0, { relaunch: true }) },
      requestExit: code => { void coordinator.requestExit(code) },
    })
    if (recovery === 'relaunch') {
      await coordinator.requestExit(0, { relaunch: true })
      return
    }
    await coordinator.recover(async () => recovery)
  }
}

export {
  DeepRunnerGenerationCoordinator,
  ElectronDeepRunnerRuntime,
}
export type { DeepRunnerGeneration }
