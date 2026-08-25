import type { DeepRunnerRendererBootReport } from '../renderer-boot.js'
import type { Context as CordisContext } from '@deepseek-ai/cordis'

export type DeepRunnerPlatform = 'darwin' | 'win32' | 'linux'
export type DeepRunnerShellMode = 'compatibility' | 'advanced'
export type DeepRunnerThemeSource = 'system' | 'light' | 'dark'

/** Versions that define whether a Profile bundle can run in this app generation. */
export interface DeepRunnerRuntimeIdentity {
  readonly deepRunnerVersion: string
  readonly dshVersion: string
  readonly cordisVersion: string
  readonly nodeVersion: string
  readonly electronVersion: string
  readonly nodeModulesVersion: string
  readonly architecture: string
}
export interface DeepRunnerNativeProfileSummary {
  readonly name: string
  readonly selectable: boolean
  readonly reason?: string
}

export interface DeepRunnerNativeProfiles {
  readonly currentName: string
  readonly currentDir: string
  list(): readonly DeepRunnerNativeProfileSummary[]
  select(name: string): Promise<void>
}

export interface DeepRunnerShellSpec {
  readonly generationId: string
  readonly mode: DeepRunnerShellMode
  readonly themeSource: DeepRunnerThemeSource
  readonly url: string
  readonly title: string
  readonly width: number
  readonly height: number
  readonly minWidth: number
  readonly minHeight: number
  readonly profiles: DeepRunnerNativeProfiles
  requestQuit(code: number): void
}

/** Internal native adapter provided by the Electron launcher. */
export interface DeepRunnerRuntime {
  readonly generationId: string
  readonly platform: DeepRunnerPlatform
  readonly identity: DeepRunnerRuntimeIdentity
  readonly themeSource: DeepRunnerThemeSource
  schedule(spec: DeepRunnerShellSpec): () => Promise<void>
  mountScheduled(): Promise<void>
  show(): void
  reportRendererBoot(report: DeepRunnerRendererBootReport): void
  waitForRendererBoot(timeoutMs?: number): Promise<DeepRunnerRendererBootReport>
  syncThemeSource(source: DeepRunnerThemeSource): void
  requestThemeChange(source: DeepRunnerThemeSource): Promise<void>
  requestRestart(): Promise<void>
  prepareToQuit(): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    deepRunnerRuntime: DeepRunnerRuntime
  }
}

export type DeepRunnerRuntimeContext = CordisContext
