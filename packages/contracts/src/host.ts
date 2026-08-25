import type { Readable } from 'node:stream'
import type { Context as CordisContext } from '@deepseek-ai/cordis'
import type { DeepRunnerProfileName } from './profile-name.js'

/** Read-only information about one discovered DSH profile. */
export interface DeepRunnerProfileSummary {
  readonly name: DeepRunnerProfileName
  readonly dir: string
  readonly exists: boolean
  readonly bundles: readonly string[]
  readonly selectable: boolean
  readonly supportsWeb: boolean
  readonly supportsAdvancedMode: boolean
  readonly reason?: string
}

/** Generation-scoped profile identity and restart-safe selection. */
export interface DeepRunnerProfiles {
  readonly current: {
    readonly name: DeepRunnerProfileName
    readonly dir: string
  }
  list(): readonly DeepRunnerProfileSummary[]
  select(name: string): Promise<void>
}

export interface DeepRunnerProcessOutcome {
  readonly exitCode: number | null
  readonly signal: NodeJS.Signals | null
}

export interface DeepRunnerProcessHandle {
  readonly stdout: Readable
  readonly stderr: Readable
  readonly done: Promise<DeepRunnerProcessOutcome>
  cancel(): void
}

/** Generation-scoped package operations bound to the active profile. */
export interface DeepRunnerPackages {
  allowBuildScripts(packageNames: readonly string[]): void
  runPnpm(args: readonly string[], signal?: AbortSignal): DeepRunnerProcessHandle
  runPlugin(
    args: readonly string[],
    invokingDir: string,
    signal?: AbortSignal,
  ): DeepRunnerProcessHandle
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    deepRunnerProfiles: DeepRunnerProfiles
    deepRunnerPackages: DeepRunnerPackages
  }
}

export type DeepRunnerHostContext = CordisContext
