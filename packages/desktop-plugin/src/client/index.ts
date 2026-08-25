import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { apply as applyDeepRunnerMarketClient } from '@deeprunner/plugin-market/client-source'
import { startDeepRunnerRendererBootReporter } from './boot-health.js'
import { mountDeepRunnerNativeThemeBridge } from './theme-bridge.js'
import {
  parseDeepRunnerClientEnvironment,
  type DeepRunnerClientEnvironment,
} from './environment.js'
import { DEEPRUNNER_CHROME_STYLES } from './styles.js'

export const inject = ['slots', 'sessions', 'theme', 'layout']

export { deepRunnerRendererBootReport, startDeepRunnerRendererBootReporter } from './boot-health.js'
export { parseDeepRunnerClientEnvironment } from './environment.js'
export type { DeepRunnerClientEnvironment } from './environment.js'
export { DEEPRUNNER_CHROME_STYLES } from './styles.js'

function installEnvironment(environment: DeepRunnerClientEnvironment): () => void {
  document.body.dataset.deeprunnerMode = environment.mode
  document.body.dataset.deeprunnerPlatform = environment.platform
  document.body.dataset.deeprunnerGeneration = environment.generationId
  document.body.dataset.deeprunnerTheme = environment.themeSource
  document.documentElement.dataset.deeprunnerTheme = environment.themeSource
  const previousColorScheme = document.documentElement.style.colorScheme
  document.documentElement.style.colorScheme = environment.themeSource === 'system'
    ? 'light dark'
    : environment.themeSource
  const style = document.createElement('style')
  style.dataset.deeprunnerChrome = 'true'
  style.textContent = DEEPRUNNER_CHROME_STYLES
  document.head.appendChild(style)
  return () => {
    delete document.body.dataset.deeprunnerMode
    delete document.body.dataset.deeprunnerPlatform
    delete document.body.dataset.deeprunnerGeneration
    delete document.body.dataset.deeprunnerTheme
    delete document.documentElement.dataset.deeprunnerTheme
    document.documentElement.style.colorScheme = previousColorScheme
    style.remove()
  }
}

/** Install the DeepRunner client additions in the official WebUI. */
export function apply(ctx: ClientContext): void {
  const environment = parseDeepRunnerClientEnvironment(window.location.search)
  ctx.theme.setTheme(environment.themeSource)
  ctx.effect(() => installEnvironment(environment), 'DeepRunner client environment')
  applyDeepRunnerMarketClient(ctx)
  ctx.effect(
    () => mountDeepRunnerNativeThemeBridge(ctx, environment.themeSource),
    'DeepRunner native window theme bridge',
  )
  ctx.effect(
    () => startDeepRunnerRendererBootReporter(ctx.loader, environment.generationId),
    'DeepRunner renderer boot health',
  )
}
