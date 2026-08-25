import {
  app,
  BrowserWindow,
  Menu,
  nativeImage,
  nativeTheme,
  shell,
  Tray,
} from 'electron'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DeepRunnerRendererBootReport } from '@deeprunner/contracts'
import type {
  DeepRunnerPlatform,
  DeepRunnerRuntime,
  DeepRunnerRuntimeIdentity,
  DeepRunnerShellSpec,
  DeepRunnerThemeSource,
} from '@deeprunner/contracts/internal/runtime'
import { readDeepRunnerAppearance, writeDeepRunnerAppearance } from './appearance.js'
import { packagedDependencyPath } from './packaged-runtime-path.js'
import {
  launchDeepRunnerTerminal,
  prepareDeepRunnerTerminal,
  type PreparedDeepRunnerTerminal,
} from './system-terminal.js'
import {
  isAllowedExternalUrl,
  isAllowedRendererNavigation,
  parseDeepRunnerRendererUrl,
} from './window-policy.js'
import { deepRunnerWindowOptions } from './window-options.js'
import {
  DeepRunnerUpdateService,
} from './update-service.js'

function packagedVersion(packageName: string): string {
  const path = packagedDependencyPath(import.meta.url, `${packageName}/package.json`)
  const manifest: unknown = JSON.parse(readFileSync(path, 'utf8'))
  const version = manifest !== null && typeof manifest === 'object' && !Array.isArray(manifest)
    ? (manifest as { version?: unknown }).version
    : undefined
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error(`DeepRunner runtime dependency ${packageName} has no version`)
  }
  return version
}

/** Initial Electron implementation of the launcher-private native adapter. */
export class ElectronDeepRunnerRuntime implements DeepRunnerRuntime {
  readonly generationId = randomUUID()
  readonly platform: DeepRunnerPlatform
  readonly identity: DeepRunnerRuntimeIdentity
  private scheduled: DeepRunnerShellSpec | undefined
  private window: BrowserWindow | undefined
  private tray: Tray | undefined
  private terminal: PreparedDeepRunnerTerminal | undefined
  private updateService: DeepRunnerUpdateService | undefined
  private updateTimer: ReturnType<typeof setTimeout> | undefined
  private quitting = false
  private readonly appearancePath: string
  private selectedThemeSource: DeepRunnerThemeSource
  private rendererBootReported = false
  private readonly rendererBootPromise: Promise<DeepRunnerRendererBootReport>
  private resolveRendererBoot!: (report: DeepRunnerRendererBootReport) => void

  constructor(
    private readonly restart: () => Promise<void>,
    private readonly rendererBoot: (report: DeepRunnerRendererBootReport) => void = () => {},
  ) {
    if (process.platform !== 'darwin' && process.platform !== 'win32' && process.platform !== 'linux') {
      throw new Error(`DeepRunner does not support Electron platform ${process.platform}`)
    }
    this.platform = process.platform
    this.identity = Object.freeze({
      deepRunnerVersion: app.getVersion(),
      dshVersion: packagedVersion('@deepseek-ai/dsh'),
      cordisVersion: packagedVersion('@deepseek-ai/cordis'),
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron ?? '0.0.0',
      nodeModulesVersion: process.versions.modules,
      architecture: process.arch,
    })
    this.appearancePath = join(app.getPath('userData'), 'appearance', 'state.json')
    this.selectedThemeSource = readDeepRunnerAppearance(this.appearancePath).themeSource
    this.rendererBootPromise = new Promise((resolve) => { this.resolveRendererBoot = resolve })
  }

  get themeSource(): DeepRunnerThemeSource {
    return this.selectedThemeSource
  }

  schedule(spec: DeepRunnerShellSpec): () => Promise<void> {
    if (this.scheduled !== undefined) throw new Error('DeepRunner already has a scheduled shell generation')
    parseDeepRunnerRendererUrl(spec.url)
    this.scheduled = spec
    let disposed = false
    return async () => {
      if (disposed) return
      disposed = true
      const window = this.window
      this.window = undefined
      if (window !== undefined && !window.isDestroyed()) window.destroy()
      this.tray?.destroy()
      this.tray = undefined
      Menu.setApplicationMenu(null)
      if (this.updateTimer !== undefined) clearTimeout(this.updateTimer)
      this.updateTimer = undefined
      this.updateService?.dispose()
      this.updateService = undefined
      if (this.scheduled === spec) this.scheduled = undefined
    }
  }

  async mountScheduled(): Promise<void> {
    const spec = this.scheduled
    if (spec === undefined) throw new Error('DeepRunner desktop plugin did not schedule a shell')
    if (this.window !== undefined) throw new Error('DeepRunner shell is already mounted')
    const renderer = parseDeepRunnerRendererUrl(spec.url)
    const origin = renderer.origin
    nativeTheme.themeSource = spec.themeSource
    const window = new BrowserWindow(deepRunnerWindowOptions(
      spec,
      this.platform,
      nativeTheme.shouldUseDarkColors,
    ))
    window.accessibleTitle = spec.title
    if (this.platform === 'win32') window.removeMenu()
    this.window = window

    this.guardWindowNavigation(window, origin)

    window.on('close', (event) => {
      if (this.quitting) return
      event.preventDefault()
      window.hide()
    })
    window.on('page-title-updated', (event) => { event.preventDefault() })
    window.once('ready-to-show', () => { window.show() })
    await window.loadURL(renderer.href)
    this.mountNativeMenus(spec)
  }

  show(): void {
    const window = this.window
    if (window === undefined || window.isDestroyed()) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }

  /** Navigate the existing sandboxed renderer to one catalog id without accepting artifact data. */
  openMarketPlugin(pluginId: string): void {
    if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(pluginId)) return
    const window = this.window
    if (window === undefined || window.isDestroyed()) return
    this.show()
    const hash = `#deeprunner-market/plugin/${pluginId}`
    void window.webContents.executeJavaScript(`window.location.hash=${JSON.stringify(hash)}`, true)
      .catch((cause: unknown) => {
        process.stderr.write(`deeprunner: unable to open market link: ${cause instanceof Error ? cause.message : String(cause)}\n`)
      })
  }

  reportRendererBoot(report: DeepRunnerRendererBootReport): void {
    if (this.rendererBootReported || report.generationId !== this.generationId) return
    this.rendererBootReported = true
    this.rendererBoot(report)
    this.resolveRendererBoot(report)
  }

  async waitForRendererBoot(timeoutMs = 20_000): Promise<DeepRunnerRendererBootReport> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error('DeepRunner renderer boot timeout must be a positive integer')
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        this.rendererBootPromise,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => { reject(new Error('DeepRunner renderer boot report timed out')) }, timeoutMs)
        }),
      ])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  async requestThemeChange(source: DeepRunnerThemeSource): Promise<void> {
    if (source === this.selectedThemeSource) return
    this.syncThemeSource(source)
    await this.restart()
  }

  syncThemeSource(source: DeepRunnerThemeSource): void {
    nativeTheme.themeSource = source
    if (source === this.selectedThemeSource) return
    writeDeepRunnerAppearance(this.appearancePath, source)
    this.selectedThemeSource = source
  }

  requestRestart(): Promise<void> {
    return this.restart()
  }

  prepareToQuit(): void {
    this.quitting = true
    if (this.updateTimer !== undefined) clearTimeout(this.updateTimer)
    this.updateTimer = undefined
  }

  async openSystemTerminal(): Promise<void> {
    const spec = this.scheduled
    if (spec === undefined) throw new Error('DeepRunner has no active Profile for Terminal')
    const terminal = this.terminal ??= prepareDeepRunnerTerminal({
      rootDir: app.getPath('userData'),
      generationId: this.generationId,
      platform: this.platform,
      version: app.getVersion(),
      profile: {
        name: spec.profiles.currentName,
        dir: spec.profiles.currentDir,
      },
      executablePath: process.execPath,
      dshEntryPath: packagedDependencyPath(import.meta.url, '@deepseek-ai/dsh/lib/bin.js'),
      pnpmEntryPath: packagedDependencyPath(import.meta.url, 'pnpm/bin/pnpm.mjs'),
    })
    if (this.platform === 'darwin') {
      const error = await shell.openPath(terminal.entryPath)
      if (error.length > 0) throw new Error(`Unable to open DeepRunner Terminal: ${error}`)
      return
    }
    await launchDeepRunnerTerminal(terminal.launchCandidates)
  }

  private guardWindowNavigation(window: BrowserWindow, origin: string): void {
    const navigate = (event: Electron.Event<{ url: string }>): void => {
      if (!isAllowedRendererNavigation(origin, event.url)) event.preventDefault()
    }
    window.webContents.on('will-frame-navigate', navigate)
    window.webContents.on('will-redirect', navigate)
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowedExternalUrl(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
  }

  private command(invoke: () => void | Promise<void>): () => void {
    return () => {
      void Promise.resolve().then(invoke).catch((cause: unknown) => {
        process.stderr.write(`deeprunner: native menu command failed: ${cause instanceof Error ? cause.message : String(cause)}\n`)
      })
    }
  }

  private mountNativeMenus(spec: DeepRunnerShellSpec): void {
    const show = (): void => { this.show() }
    this.updateService ??= new DeepRunnerUpdateService({
      setProgress: progress => {
        if (this.window !== undefined && !this.window.isDestroyed()) {
          this.window.setProgressBar(progress)
        }
      },
    })
    if (app.isPackaged && this.updateTimer === undefined) {
      this.updateTimer = setTimeout(() => { void this.updateService?.check(false) }, 30_000)
    }
    const applicationTemplate: Electron.MenuItemConstructorOptions[] = this.platform === 'darwin'
      ? [
          { label: spec.title, submenu: [
            { role: 'about' },
            { label: 'Check for Updates…', click: this.command(() => this.updateService?.check(true)) },
            { type: 'separator' },
            { role: 'quit' },
          ] },
          { label: 'File', submenu: [
            { label: `Open ${spec.title}`, click: show },
            { label: 'Open DeepRunner Terminal', click: this.command(() => this.openSystemTerminal()) },
            { label: 'Check for Updates…', click: this.command(() => this.updateService?.check(true)) },
            { type: 'separator' },
            { role: 'close' },
          ] },
          { role: 'editMenu' },
          { role: 'viewMenu' },
          { role: 'windowMenu' },
        ]
      : [
          { label: 'File', submenu: [
            { label: `Open ${spec.title}`, click: show },
            { label: 'Open DeepRunner Terminal', click: this.command(() => this.openSystemTerminal()) },
            { type: 'separator' },
            { label: 'Quit', click: () => { spec.requestQuit(0) } },
          ] },
          { role: 'viewMenu' },
        ]
    Menu.setApplicationMenu(Menu.buildFromTemplate(applicationTemplate))

    let tray = this.tray
    if (tray === undefined || tray.isDestroyed()) {
      const size = 18
      const bitmap = Buffer.alloc(size * size * 4)
      for (let y = 2; y <= 15; y += 1) {
        for (let x = 3; x <= 14; x += 1) {
          const visible = x <= 5
            || (y <= 4 && x <= 11)
            || (y >= 13 && x <= 11)
            || (x >= 12 && y >= 5 && y <= 12)
          if (!visible) continue
          const offset = (y * size + x) * 4
          bitmap[offset] = this.platform === 'darwin' ? 0 : 255
          bitmap[offset + 1] = this.platform === 'darwin' ? 0 : 104
          bitmap[offset + 2] = this.platform === 'darwin' ? 0 : 39
          bitmap[offset + 3] = 255
        }
      }
      const icon = nativeImage.createFromBitmap(bitmap, { width: size, height: size, scaleFactor: 1 })
      if (this.platform === 'darwin') icon.setTemplateImage(true)
      if (icon.isEmpty()) throw new Error('DeepRunner failed to create the native tray icon')
      tray = new Tray(icon)
      tray.setToolTip(spec.title)
      tray.on('click', show)
      this.tray = tray
    }
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: `Open ${spec.title}`, click: show },
      { label: 'Open DeepRunner Terminal', click: this.command(() => this.openSystemTerminal()) },
      { label: 'Check for Updates…', click: this.command(() => this.updateService?.check(true)) },
      { type: 'separator' },
      { label: 'Quit', click: () => { spec.requestQuit(0) } },
    ]))
  }
}

/** Adapter used by the generation coordinator after Cordis disposal. */
export const electronNativeExit = {
  prepareToQuit(): void {},
  relaunch(): void { app.relaunch() },
  exit(code: number): void { app.exit(code) },
}
