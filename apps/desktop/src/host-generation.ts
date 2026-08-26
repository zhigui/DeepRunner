import type { Context } from '@deepseek-ai/cordis'
import { app } from 'electron'
import {
  boot,
  loadLayeredEnv,
} from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { DSH_LAUNCH_ENVIRONMENT_KEY } from '@deepseek-ai/dsh-launch-environment'
import type { DeepRunnerRuntime } from '@deeprunner/contracts/internal/runtime'
import { bindDeepRunnerDshHome } from './dsh-home.js'
import type { DeepRunnerGeneration } from './generation-coordinator.js'
import {
  beginDeepRunnerProfileStartup,
  listDeepRunnerProfiles,
  markDeepRunnerProfileHealthy,
} from './profile-manager.js'
import {
  consumeDeepRunnerSafeMode,
  deepRunnerProfilePaths,
  requestDeepRunnerSafeMode,
} from './profile-recovery.js'
import {
  installDeepRunnerLoaderImportFallback,
  prepareDeepRunnerProfile,
} from './profile.js'
import { DeepRunnerProfileService } from './profile-service.js'

const BIN_NAME = 'deeprunner'

export interface DeepRunnerHostRecoveryContext {
  readonly homeDir: string
  readonly statePath: string
  readonly safeModePath: string
}

/** Resolve the shared Profile recovery paths without starting a Host. */
export function deepRunnerHostRecoveryContext(): DeepRunnerHostRecoveryContext {
  const userDataDir = app.getPath('userData')
  const homeDir = bindDeepRunnerDshHome(userDataDir)
  const paths = deepRunnerProfilePaths(userDataDir)
  return { homeDir, ...paths }
}

/** Request one safe built-in generation for the next relaunch. */
export function requestDeepRunnerHostSafeMode(): void {
  const recovery = deepRunnerHostRecoveryContext()
  requestDeepRunnerSafeMode(recovery.safeModePath, recovery.statePath, recovery.homeDir)
}

/** Boot the official Web profile plus the DeepRunner desktop layer. */
export async function bootDeepRunnerHostGeneration(
  runtime: DeepRunnerRuntime,
  requestExit: (code: number) => void,
): Promise<DeepRunnerGeneration> {
  // Pin DSH_HOME before environment discovery: loadLayeredEnv reads the
  // Harness-home .env and must never probe another client's ~/.dsh first.
  const { homeDir, statePath, safeModePath } = deepRunnerHostRecoveryContext()
  const environment = loadLayeredEnv(BIN_NAME, process.cwd())
  const safeMode = consumeDeepRunnerSafeMode(safeModePath)
  const startup = beginDeepRunnerProfileStartup(statePath, homeDir)
  const prepared = prepareDeepRunnerProfile(homeDir, startup.profileName, {
    safeMode,
    runtime: runtime.identity,
  })
  let disposeLoaderImportFallback = (): void => {}
  let context: Context | undefined
  const profiles = new DeepRunnerProfileService({
    current: { name: startup.profileName, dir: prepared.profile.dir },
    homeDir,
    statePath,
    requestRestart: () => runtime.requestRestart(),
  })

  try {
    context = await boot(
      BIN_NAME,
      prepared.rootConfig,
      prepared.patches,
      (hostContext) => {
        context = hostContext
        disposeLoaderImportFallback = installDeepRunnerLoaderImportFallback(hostContext.loader)
        hostContext.provide(DSH_LAUNCH_ENVIRONMENT_KEY, environment)
        hostContext.provide('deepRunnerRuntime', runtime)
        hostContext.provide('deepRunnerProfiles', profiles)
        for (const plugin of prepared.skippedPlugins) {
          hostContext.logger.warn(`DeepRunner skipped Profile plugin ${plugin.packageName}: ${plugin.reason}`)
        }
        hostContext.effect(() => () => { profiles.dispose() }, 'DeepRunner Profile service lifetime')
        provideCmdline(hostContext, {
          // Electron owns the desktop surface, so the Web bundle must not launch
          // a second browser process through Electron's process.execPath.
          args: ['--host', '127.0.0.1', '--port', '0', '--no-open'],
          exit: requestExit,
        })
      },
      prepared.bareModuleBaseUrl,
    )
    await runtime.mountScheduled()
    const rendererBoot = await runtime.waitForRendererBoot()
    if (rendererBoot.status === 'failed') {
      const plugins = rendererBoot.plugins.length === 0 ? 'unknown client plugin' : rendererBoot.plugins.join(', ')
      throw new Error(`DeepRunner Client Loader failed: ${plugins}${rendererBoot.error === undefined ? '' : `: ${rendererBoot.error}`}`)
    }
    markDeepRunnerProfileHealthy(statePath, startup.profileName)
  } catch (cause) {
    profiles.dispose()
    await context?.fiber.dispose().catch(() => {})
    disposeLoaderImportFallback()
    throw cause
  }

  const activeContext = context
  if (activeContext === undefined) {
    profiles.dispose()
    disposeLoaderImportFallback()
    throw new Error('DeepRunner Host generation disposed during startup')
  }
  return {
    dispose: async () => {
      try {
        await activeContext.fiber.dispose()
      } finally {
        // Dynamic Loader trees (including Market hot mounts) still resolve
        // bare package names from the active Profile after initial boot.
        disposeLoaderImportFallback()
      }
    },
  }
}
