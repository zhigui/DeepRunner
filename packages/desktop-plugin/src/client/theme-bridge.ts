import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { DeepRunnerThemeSource } from '@deeprunner/contracts/internal/runtime'
import { DEEPRUNNER_THEME_SYNC_PATH } from '../transport-paths.js'

/** Keep Electron's native titlebar appearance aligned with the WebUI preference. */
export function mountDeepRunnerNativeThemeBridge(
  ctx: ClientContext,
  initial: DeepRunnerThemeSource,
  request: typeof globalThis.fetch = globalThis.fetch,
): () => void {
  let published = initial
  const publish = (source: DeepRunnerThemeSource): void => {
    if (source === published) return
    published = source
    void request(DEEPRUNNER_THEME_SYNC_PATH, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source }),
    }).then((response) => {
      if (!response.ok) throw new Error(`native theme sync failed with HTTP ${String(response.status)}`)
    }).catch((cause: unknown) => {
      console.error('DeepRunner failed to sync native window theme', cause)
    })
  }
  const off = ctx.on('theme/change', snapshot => { publish(snapshot.preference) })
  publish(ctx.theme.getTheme().preference)
  return off
}
