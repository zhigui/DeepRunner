import { describe, expect, it } from 'vitest'
import { parseDeepRunnerProfileName } from '@deeprunner/contracts'
import {
  deepRunnerRecoveryHtml,
  parseDeepRunnerRecoveryAction,
} from '../src/profile-recovery-page.js'

describe('DeepRunner recovery page', () => {
  it('accepts only the fixed recovery navigation surface', () => {
    expect(parseDeepRunnerRecoveryAction('deeprunner-recovery://action/restart'))
      .toEqual({ kind: 'restart' })
    expect(parseDeepRunnerRecoveryAction('deeprunner-recovery://action/select?profile=team'))
      .toEqual({ kind: 'select', profile: 'team' })
    expect(parseDeepRunnerRecoveryAction('https://example.com/select?profile=team')).toBeUndefined()
    expect(parseDeepRunnerRecoveryAction('deeprunner-recovery://action/select?profile=a&profile=b'))
      .toBeUndefined()
    expect(parseDeepRunnerRecoveryAction('deeprunner-recovery://action/restart?unexpected=1'))
      .toBeUndefined()
  })

  it('renders a script-free page and escapes failure content', () => {
    const profile = parseDeepRunnerProfileName('deeprunner')
    const html = deepRunnerRecoveryHtml({
      failedProfile: profile,
      lastKnownGood: profile,
      error: '<script>alert(1)</script>',
      profiles: [{
        name: profile,
        dir: '/profile',
        exists: true,
        bundles: [],
        selectable: true,
        supportsWeb: true,
        supportsAdvancedMode: true,
      }],
    })
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain("default-src 'none'")
  })
})
