export interface DeepRunnerClientEnvironment {
  readonly mode: 'compatibility' | 'advanced'
  readonly platform: 'darwin' | 'win32' | 'linux'
  readonly generationId: string
  readonly themeSource: 'system' | 'light' | 'dark'
}

/** Parse Host-owned markers without accepting arbitrary mode or platform values. */
export function parseDeepRunnerClientEnvironment(search: string): DeepRunnerClientEnvironment {
  const params = new URLSearchParams(search)
  const mode = params.get('deeprunner-mode')
  const platform = params.get('deeprunner-platform')
  const generationId = params.get('deeprunner-generation')
  const themeSource = params.get('deeprunner-theme')
  if (mode !== 'compatibility' && mode !== 'advanced') {
    throw new Error(`invalid DeepRunner client mode ${JSON.stringify(mode)}`)
  }
  if (platform !== 'darwin' && platform !== 'win32' && platform !== 'linux') {
    throw new Error(`invalid DeepRunner client platform ${JSON.stringify(platform)}`)
  }
  if (generationId === null || generationId.length === 0 || generationId.length > 128) {
    throw new Error('invalid DeepRunner generation id')
  }
  if (themeSource !== 'system' && themeSource !== 'light' && themeSource !== 'dark') {
    throw new Error(`invalid DeepRunner theme source ${JSON.stringify(themeSource)}`)
  }
  return { mode, platform, generationId, themeSource }
}
