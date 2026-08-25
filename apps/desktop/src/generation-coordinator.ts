/** A fully booted Host/Client/native generation owned by the launcher. */
export interface DeepRunnerGeneration {
  dispose(): Promise<void>
}

export interface DeepRunnerNativeExit {
  prepareToQuit(): void
  relaunch(): void
  exit(code: number): void
}

export type DeepRunnerGenerationStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'disposing'
  | 'stopped'
  | 'failed'

/** Coordinates one immutable generation and a bounded final exit. */
export class DeepRunnerGenerationCoordinator {
  private generation: DeepRunnerGeneration | undefined
  private generationTask: Promise<DeepRunnerGeneration> | undefined
  private pendingExit: Promise<void> | undefined
  private exitTimer: ReturnType<typeof setTimeout> | undefined
  private exited = false
  private relaunchRequested = false
  private currentStatus: DeepRunnerGenerationStatus = 'idle'

  constructor(
    private readonly native: DeepRunnerNativeExit,
    private readonly timeoutMs = 5_000,
  ) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error('DeepRunner generation timeout must be a positive integer')
    }
  }

  get status(): DeepRunnerGenerationStatus {
    return this.currentStatus
  }

  /** Boot the only generation owned by this Electron process. */
  async start(factory: () => Promise<DeepRunnerGeneration>): Promise<void> {
    if (this.currentStatus !== 'idle') {
      throw new Error(`DeepRunner cannot start a generation while ${this.currentStatus}`)
    }
    this.currentStatus = 'starting'
    const generationTask = Promise.resolve().then(factory)
    this.generationTask = generationTask
    try {
      this.generation = await generationTask
      // An application-level quit may arrive while Electron or the Host is
      // still starting. In that case requestExit() owns the new generation
      // and this continuation must not move the state back to running.
      if (this.currentStatus === 'starting') this.currentStatus = 'running'
    } catch (cause) {
      if (this.currentStatus === 'starting') this.currentStatus = 'failed'
      throw cause
    }
  }

  /** Adopt a minimal recovery generation after ordinary startup failed. */
  async recover(factory: () => Promise<DeepRunnerGeneration>): Promise<void> {
    if (this.currentStatus !== 'failed') {
      throw new Error(`DeepRunner cannot recover a generation while ${this.currentStatus}`)
    }
    this.currentStatus = 'starting'
    const generationTask = Promise.resolve().then(factory)
    this.generationTask = generationTask
    try {
      this.generation = await generationTask
      if (this.currentStatus === 'starting') this.currentStatus = 'running'
    } catch (cause) {
      if (this.currentStatus === 'starting') this.currentStatus = 'failed'
      throw cause
    }
  }

  /** Request a graceful final exit; a second request escalates immediately. */
  requestExit(code: number, options: { relaunch?: boolean } = {}): Promise<void> {
    if (!Number.isSafeInteger(code) || code < 0) {
      return Promise.reject(new Error('DeepRunner exit code must be a non-negative integer'))
    }
    if (options.relaunch === true) this.relaunchRequested = true
    if (this.pendingExit !== undefined) {
      this.finish(code)
      return this.pendingExit
    }

    const startupFailed = this.currentStatus === 'failed'
    this.currentStatus = 'disposing'
    const failureCode = code === 0 ? 1 : code
    this.exitTimer = setTimeout(() => { this.finish(failureCode) }, this.timeoutMs)
    this.pendingExit = Promise.resolve().then(async () => {
      // Fence startup and disposal into one lifetime. Without awaiting the
      // in-flight factory, a quit during startup could exit before the Host,
      // BrowserWindow, or Tray has registered its disposer.
      const generation = this.generation ?? (startupFailed ? undefined : await this.generationTask)
      await generation?.dispose()
    }).then(
      () => {
        this.currentStatus = 'stopped'
        this.finish(code)
      },
      () => {
        this.currentStatus = 'failed'
        this.finish(failureCode)
      },
    )
    return this.pendingExit
  }

  private finish(code: number): void {
    if (this.exited) return
    this.exited = true
    if (this.exitTimer !== undefined) clearTimeout(this.exitTimer)
    this.native.prepareToQuit()
    if (this.relaunchRequested && code === 0) this.native.relaunch()
    this.native.exit(code)
  }
}
