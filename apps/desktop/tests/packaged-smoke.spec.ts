import { describe, expect, it } from 'vitest'
import {
  DEEPRUNNER_PACKAGED_SMOKE_PREFIX,
  formatDeepRunnerPackagedSmokeResult,
  isDeepRunnerPackagedSmoke,
} from '../src/packaged-smoke.js'

describe('packaged application smoke protocol', () => {
  it('requires the exact opt-in value', () => {
    expect(isDeepRunnerPackagedSmoke({ DEEPRUNNER_PACKAGED_SMOKE: '1' })).toBe(true)
    expect(isDeepRunnerPackagedSmoke({ DEEPRUNNER_PACKAGED_SMOKE: 'true' })).toBe(false)
    expect(isDeepRunnerPackagedSmoke({})).toBe(false)
  })

  it('emits one machine-readable renderer result line', () => {
    expect(formatDeepRunnerPackagedSmokeResult({
      status: 'healthy',
      generationId: 'generation-1',
    })).toBe(`${DEEPRUNNER_PACKAGED_SMOKE_PREFIX}{"status":"healthy","generationId":"generation-1"}\n`)
  })
})
