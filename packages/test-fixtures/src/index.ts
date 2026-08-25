import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deeprunner/contracts/host'

export const name = 'deeprunner-host-services-smoke-fixture'
export const inject = ['deepRunnerProfiles', 'deepRunnerPackages']

export interface DeepRunnerHostServicesProbe {
  readonly profile: string
  readonly profileDir: string
  readonly hasPnpm: boolean
  readonly hasPluginRunner: boolean
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    deepRunnerHostServicesProbe: DeepRunnerHostServicesProbe
  }
}

/** Loader fixture proving that both public Host services satisfy injection. */
export function apply(ctx: Context): void {
  ctx.provide('deepRunnerHostServicesProbe', {
    profile: ctx.deepRunnerProfiles.current.name,
    profileDir: ctx.deepRunnerProfiles.current.dir,
    hasPnpm: typeof ctx.deepRunnerPackages.runPnpm === 'function',
    hasPluginRunner: typeof ctx.deepRunnerPackages.runPlugin === 'function',
  })
}

