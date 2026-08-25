import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import {
  DeepRunnerMarketButton,
  DeepRunnerMarketPage,
  marketVisibility,
} from './market.js'
import { marketStore } from './store.js'
import { DEEPRUNNER_MARKET_STYLES } from './styles.js'

export const inject = ['slots', 'sessions']

export { DeepRunnerMarketButton, DeepRunnerMarketPage, marketVisibility } from './market.js'
export { DEEPRUNNER_MARKET_STYLES } from './styles.js'

function installMarketStyles(): () => void {
  const style = document.createElement('style')
  style.dataset.deeprunnerMarket = 'true'
  style.textContent = DEEPRUNNER_MARKET_STYLES
  document.head.appendChild(style)
  return () => { style.remove() }
}

/**
 * While the market is open, its browser and plugin detail share one dynamic
 * `conversation` registration. Disposal hands the center column straight
 * back; switching between established conversations closes the market.
 */
function mountMarket(ctx: ClientContext): () => void {
  let releaseConversation: (() => void) | undefined
  let lastCurrent = ctx.sessions.list.getSnapshot().current

  const sync = (): void => {
    if (!marketVisibility.snapshot()) {
      releaseConversation?.()
      releaseConversation = undefined
      return
    }
    releaseConversation ??= ctx.slots.register({ name: 'conversation', priority: -1 }, DeepRunnerMarketPage)
  }
  const onSessionsChanged = (): void => {
    const current = ctx.sessions.list.getSnapshot().current
    if (lastCurrent !== undefined && current !== undefined && current !== lastCurrent) {
      lastCurrent = current
      marketVisibility.set(false)
    } else {
      lastCurrent = current
    }
    sync()
  }

  const unsubscribeVisibility = marketVisibility.subscribe(sync)
  const unsubscribeSessions = ctx.sessions.list.subscribe(onSessionsChanged)
  sync()
  return () => {
    unsubscribeVisibility()
    unsubscribeSessions()
    releaseConversation?.()
    releaseConversation = undefined
  }
}

function installDeepLinkNavigation(): () => void {
  const open = (): void => {
    const match = /^#deeprunner-market\/plugin\/((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)$/u.exec(window.location.hash)
    if (match === null) return
    const pluginId = match[1]
    history.replaceState(history.state, '', `${location.pathname}${location.search}`)
    marketStore.select(pluginId)
    marketVisibility.set(true)
    void marketStore.loadCatalog()
  }
  window.addEventListener('hashchange', open)
  open()
  return () => { window.removeEventListener('hashchange', open) }
}

/** Add the market trigger plus its self-contained browser and detail view. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    document.body.dataset.deeprunnerMarket = 'available'
    return () => { delete document.body.dataset.deeprunnerMarket }
  }, 'DeepRunner market client state')
  ctx.effect(installMarketStyles, 'DeepRunner market styles')
  ctx.effect(() => {
    // Body-level open flag: lets stylesheet rules drop the sidebar's current-
    // conversation highlight while the market owns the conversation slot.
    const syncOpenFlag = (): void => {
      document.body.dataset.deeprunnerMarketOpen = String(marketVisibility.snapshot())
    }
    syncOpenFlag()
    const unsubscribe = marketVisibility.subscribe(syncOpenFlag)
    return () => {
      unsubscribe()
      delete document.body.dataset.deeprunnerMarketOpen
    }
  }, 'DeepRunner market open state')
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'deeprunner-market',
    order: 20,
    label: 'Plugin market',
  }, DeepRunnerMarketButton))
  ctx.effect(() => mountMarket(ctx), 'DeepRunner market main view')
  ctx.effect(installDeepLinkNavigation, 'DeepRunner market deep-link navigation')
}
