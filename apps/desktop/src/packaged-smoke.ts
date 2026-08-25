import type { DeepRunnerRendererBootReport } from '@deeprunner/contracts'

export const DEEPRUNNER_PACKAGED_SMOKE_ENV = 'DEEPRUNNER_PACKAGED_SMOKE'
export const DEEPRUNNER_PACKAGED_SMOKE_PREFIX = 'DEEPRUNNER_PACKAGED_SMOKE_RESULT '

export function isDeepRunnerPackagedSmoke(environment: NodeJS.ProcessEnv): boolean {
  return environment[DEEPRUNNER_PACKAGED_SMOKE_ENV] === '1'
}

export function formatDeepRunnerPackagedSmokeResult(report: DeepRunnerRendererBootReport): string {
  return `${DEEPRUNNER_PACKAGED_SMOKE_PREFIX}${JSON.stringify(report)}\n`
}
