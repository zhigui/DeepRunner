import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deeprunner/contracts/host'
import type {} from '@deeprunner/contracts/internal/runtime'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { DeepRunnerMarketCatalogService } from './catalog.js'
import { DEEPRUNNER_MARKET_PATH } from './contract.js'
import { DeepRunnerMarketOperationService } from './operations.js'
import { DeepRunnerManualInstallService } from './manual-install.js'
import {
  DEEPRUNNER_MARKET_CATALOG_URL,
  DeepRunnerRemoteCatalogController,
} from './remote-catalog.js'
import { handleDeepRunnerMarketRequest } from './transport.js'
import { DeepRunnerMarketHotActivationService } from './hot-activation.js'

export {
  BUILTIN_MARKET_CATALOG,
  DEEPRUNNER_MARKET_SCHEMA_VERSION,
  DeepRunnerMarketCatalogService,
  parseDeepRunnerMarketCatalog,
} from './catalog.js'
export * from './contract.js'
export {
  auditDeepRunnerInstalledPlugin,
  createDeepRunnerMarketReceipt,
  defaultDeepRunnerRuntimeIdentity,
  marketReleaseCompatibility,
  readDisabledDeepRunnerPlugins,
  readDeepRunnerMarketReceipts,
  removeDeepRunnerMarketReceipt,
  saveDeepRunnerMarketReceipt,
  setDeepRunnerPluginDisabled,
} from './compatibility.js'
export type {
  DeepRunnerInstalledPluginAudit,
  DeepRunnerMarketInstallReceipt,
} from './compatibility.js'
export { DeepRunnerMarketOperationService } from './operations.js'
export { DeepRunnerManualInstallService } from './manual-install.js'
export { DeepRunnerMarketHotActivationService, parseDeepRunnerHotPatch } from './hot-activation.js'
export {
  DEEPRUNNER_MARKET_CATALOG_URL,
  DeepRunnerRemoteCatalogController,
  deepRunnerMarketCachePath,
} from './remote-catalog.js'
export { handleDeepRunnerMarketRequest } from './transport.js'

export const name = 'deeprunner-plugin-market'
export const inject = ['webServer', 'deepRunnerProfiles', 'deepRunnerPackages', 'deepRunnerRuntime']

/** Register the generation-scoped controlled catalog and its same-origin mutation API. */
export function apply(ctx: Context): void {
  if (ctx.webServer.host !== '127.0.0.1') {
    throw new Error('DeepRunner market requires the Host Web server to bind 127.0.0.1')
  }
  const profiles = ctx.deepRunnerProfiles
  const packages = ctx.deepRunnerPackages
  const runtime = ctx.deepRunnerRuntime
  const catalog = new DeepRunnerMarketCatalogService({ profiles, runtime: runtime.identity })
  const remoteCatalog = new DeepRunnerRemoteCatalogController({ catalog, profiles })
  const activation = new DeepRunnerMarketHotActivationService(ctx, profiles.current.dir)
  const catalogReady = remoteCatalog.start()
  const operations = new DeepRunnerMarketOperationService({
    catalog,
    packages,
    profiles,
    runtime: runtime.identity,
    activate: (kind, packageName) => activation.apply(kind, packageName),
  })
  const manual = new DeepRunnerManualInstallService({
    operations,
    profiles,
    runtime: runtime.identity,
  })
  const expectedOrigin = `http://127.0.0.1:${String(ctx.webServer.port)}`
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'prefix',
      path: DEEPRUNNER_MARKET_PATH,
      handler: (req, res) => handleDeepRunnerMarketRequest(req, res, {
        expectedOrigin,
        catalog,
        catalogReady,
        operations,
        manual,
        runtime,
      }),
    }),
    'DeepRunner Market API',
  )
  ctx.effect(() => () => { remoteCatalog.dispose() }, 'DeepRunner Market remote catalog')
  ctx.effect(() => () => activation.dispose(), 'DeepRunner Market hot activation')
  ctx.logger.info(`DeepRunner market active for profile ${profiles.current.name}`)
}
