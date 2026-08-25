import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-cmdline'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deeprunner/contracts'
import type {} from '@deeprunner/contracts/internal/runtime'
import type { DeepRunnerShellMode, DeepRunnerThemeSource } from '@deeprunner/contracts/internal/runtime'
import {
  DEEPRUNNER_RENDERER_BOOT_PATH,
  handleDeepRunnerRendererBootRequest,
} from './renderer-boot.js'
import {
  DEEPRUNNER_THEME_SYNC_PATH,
  handleDeepRunnerThemeSyncRequest,
} from './theme-transport.js'
import { DeepRunnerPackageService } from './package-service.js'

export {
  DEEPRUNNER_PACKAGE_OPERATION_DEADLINE_MS,
  DEEPRUNNER_PACKAGE_TERMINATION_GRACE_MS,
  DeepRunnerPackageService,
} from './package-service.js'

export {
  DEEPRUNNER_RENDERER_BOOT_PATH,
  DEEPRUNNER_THEME_SYNC_PATH,
  handleDeepRunnerRendererBootRequest,
  handleDeepRunnerThemeSyncRequest,
}

export const name = 'deeprunner-shell'
export const inject = ['webServer', 'webRuntime', 'appExit', 'deepRunnerProfiles', 'subprocess']

export interface Config {
  readonly mode: 'native' | DeepRunnerShellMode
  readonly width?: number
  readonly height?: number
  readonly minWidth?: number
  readonly minHeight?: number
}

/** Construct the exact loopback page owned by one Host generation. */
export function deepRunnerRendererUrl(
  port: number,
  mode: DeepRunnerShellMode,
  platform: NodeJS.Platform,
  generationId: string,
  themeSource: DeepRunnerThemeSource = 'system',
): string {
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
    throw new Error('DeepRunner web server port must be a valid positive integer')
  }
  const url = new URL(`http://127.0.0.1:${String(port)}/`)
  url.searchParams.set('deeprunner-mode', mode)
  url.searchParams.set('deeprunner-platform', platform)
  url.searchParams.set('deeprunner-generation', generationId)
  url.searchParams.set('deeprunner-theme', themeSource)
  return url.href
}

/** Register the native shell for the current Host generation. */
export function apply(ctx: Context, config: Config): void {
  const runtime = ctx.get('deepRunnerRuntime')
  if (runtime === undefined) {
    ctx.logger.warn('DeepRunner desktop bundle is inactive because the launcher runtime is unavailable')
    return
  }
  if (ctx.webServer.host !== '127.0.0.1') {
    throw new Error('DeepRunner requires the Host Web server to bind 127.0.0.1')
  }
  const mode: DeepRunnerShellMode = config.mode === 'native'
    ? runtime.platform === 'linux' ? 'compatibility' : 'advanced'
    : config.mode
  if (mode === 'advanced' && runtime.platform === 'linux') {
    throw new Error('DeepRunner advanced mode is not supported on Linux')
  }
  const appExit = ctx.get('appExit')
  if (appExit === undefined) {
    throw new Error('DeepRunner launcher did not provide appExit')
  }
  const packages = new DeepRunnerPackageService({
    profiles: ctx.deepRunnerProfiles,
    subprocess: ctx.subprocess,
  })
  ctx.provide('deepRunnerPackages', packages)
  ctx.effect(() => async () => { await packages.dispose() }, 'DeepRunner Package service lifetime')
  const rendererOrigin = `http://127.0.0.1:${String(ctx.webServer.port)}`
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: DEEPRUNNER_RENDERER_BOOT_PATH,
      handler: (req, res) => handleDeepRunnerRendererBootRequest(
        req,
        res,
        rendererOrigin,
        runtime.generationId,
        report => { runtime.reportRendererBoot(report) },
      ),
    }),
    'DeepRunner renderer boot report route',
  )
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: DEEPRUNNER_THEME_SYNC_PATH,
      handler: (req, res) => handleDeepRunnerThemeSyncRequest(
        req,
        res,
        rendererOrigin,
        source => { runtime.syncThemeSource(source) },
      ),
    }),
    'DeepRunner native theme sync route',
  )
  ctx.effect(
    () => runtime.schedule({
      generationId: runtime.generationId,
      mode,
      themeSource: runtime.themeSource,
      url: deepRunnerRendererUrl(
        ctx.webServer.port,
        mode,
        runtime.platform,
        runtime.generationId,
        runtime.themeSource,
      ),
      title: 'DeepRunner',
      width: config.width ?? 1280,
      height: config.height ?? 840,
      minWidth: config.minWidth ?? 900,
      minHeight: config.minHeight ?? 640,
      profiles: {
        currentName: ctx.deepRunnerProfiles.current.name,
        currentDir: ctx.deepRunnerProfiles.current.dir,
        list: () => ctx.deepRunnerProfiles.list(),
        select: name => ctx.deepRunnerProfiles.select(name),
      },
      requestQuit: appExit,
    }),
    'DeepRunner native shell generation',
  )
}
