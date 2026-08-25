const ID_COMPONENT = '[a-z0-9][a-z0-9._-]*'
const PLUGIN_ID = new RegExp(`^(?:@${ID_COMPONENT}/)?${ID_COMPONENT}$`, 'u')

export interface DeepRunnerMarketDeepLink {
  readonly kind: 'market-plugin'
  readonly pluginId: string
}

/** Parse the deliberately tiny external protocol surface; all other inputs fail closed. */
export function parseDeepRunnerDeepLink(value: string): DeepRunnerMarketDeepLink | undefined {
  if (value.length > 512 || value.includes('\0')) return undefined
  let url: URL
  try { url = new URL(value) } catch { return undefined }
  if (url.protocol !== 'deeprunner:' || url.hostname !== 'market' || url.port !== ''
    || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') return undefined
  const match = /^\/plugin\/(.+)$/u.exec(url.pathname)
  const pluginId = match?.[1]
  if (pluginId === undefined || pluginId.includes('%')) return undefined
  return PLUGIN_ID.test(pluginId) ? { kind: 'market-plugin', pluginId } : undefined
}

export function deepRunnerDeepLinkFromArgv(argv: readonly string[]): DeepRunnerMarketDeepLink | undefined {
  for (const argument of argv) {
    const parsed = parseDeepRunnerDeepLink(argument)
    if (parsed !== undefined) return parsed
  }
  return undefined
}
