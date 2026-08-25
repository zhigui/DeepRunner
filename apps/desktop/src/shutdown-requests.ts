export interface DeepRunnerQuitEvent {
  preventDefault(): void
}

export interface DeepRunnerSignalSource {
  on(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown
  off(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown
}

export interface DeepRunnerQuitSource {
  on(event: 'before-quit', listener: (event: DeepRunnerQuitEvent) => void): unknown
  off(event: 'before-quit', listener: (event: DeepRunnerQuitEvent) => void): unknown
}

/** Route every application-level quit source through generation disposal. */
export function installDeepRunnerShutdownRequests(
  signals: DeepRunnerSignalSource,
  nativeApp: DeepRunnerQuitSource,
  requestExit: (code: number) => void,
): () => void {
  const interrupt = (): void => { requestExit(130) }
  const terminate = (): void => { requestExit(0) }
  const beforeQuit = (event: DeepRunnerQuitEvent): void => {
    event.preventDefault()
    requestExit(0)
  }
  signals.on('SIGINT', interrupt)
  signals.on('SIGTERM', terminate)
  nativeApp.on('before-quit', beforeQuit)

  let installed = true
  return () => {
    if (!installed) return
    installed = false
    signals.off('SIGINT', interrupt)
    signals.off('SIGTERM', terminate)
    nativeApp.off('before-quit', beforeQuit)
  }
}
