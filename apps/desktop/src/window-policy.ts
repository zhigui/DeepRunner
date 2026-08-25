/** Parse and validate the loopback HTTP URL supplied by the Host Web service. */
export function parseDeepRunnerRendererUrl(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.port.length === 0) {
    throw new Error('DeepRunner renderer URL must use an explicit 127.0.0.1 HTTP port')
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new Error('DeepRunner renderer URL must not contain credentials')
  }
  return url
}

/** Only the active carrier origin may replace the BrowserWindow main frame. */
export function isAllowedRendererNavigation(activeOrigin: string, target: string): boolean {
  try {
    return new URL(target).origin === activeOrigin
  } catch {
    return false
  }
}

/** External links are limited to protocols delegated safely to the OS. */
export function isAllowedExternalUrl(value: string): boolean {
  try {
    return ['https:', 'http:', 'mailto:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

