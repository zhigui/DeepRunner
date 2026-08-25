import { describe, expect, it } from 'vitest'
import {
  isAllowedExternalUrl,
  isAllowedRendererNavigation,
  parseDeepRunnerRendererUrl,
} from '../src/window-policy.js'

describe('DeepRunner window policy', () => {
  it('accepts only explicit loopback HTTP carrier URLs', () => {
    expect(parseDeepRunnerRendererUrl('http://127.0.0.1:3210/').port).toBe('3210')
    expect(() => parseDeepRunnerRendererUrl('https://127.0.0.1:3210/')).toThrow()
    expect(() => parseDeepRunnerRendererUrl('http://localhost:3210/')).toThrow()
  })

  it('keeps renderer navigation on the active origin', () => {
    expect(isAllowedRendererNavigation('http://127.0.0.1:3210', 'http://127.0.0.1:3210/settings')).toBe(true)
    expect(isAllowedRendererNavigation('http://127.0.0.1:3210', 'http://127.0.0.1:3211/')).toBe(false)
  })

  it('delegates only supported external protocols', () => {
    expect(isAllowedExternalUrl('https://example.com')).toBe(true)
    expect(isAllowedExternalUrl('mailto:team@example.com')).toBe(true)
    expect(isAllowedExternalUrl('file:///tmp/secret')).toBe(false)
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
  })
})

