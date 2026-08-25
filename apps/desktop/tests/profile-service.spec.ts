import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { parseDeepRunnerProfileName } from '@deeprunner/contracts'
import { DeepRunnerProfileService } from '../src/profile-service.js'

function serviceFixture(requestRestart: () => Promise<void>): DeepRunnerProfileService {
  const root = mkdtempSync(join(tmpdir(), 'deeprunner-service-'))
  const homeDir = join(root, 'home')
  const profileDir = join(homeDir, 'profiles', 'team')
  mkdirSync(profileDir, { recursive: true })
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
  }), 'utf8')
  return new DeepRunnerProfileService({
    current: {
      name: parseDeepRunnerProfileName('deeprunner'),
      dir: join(homeDir, 'profiles', 'deeprunner'),
    },
    homeDir,
    statePath: join(root, 'user-data', 'profile-selection', 'state.json'),
    requestRestart,
  })
}

describe('DeepRunner Profile service', () => {
  it('shares one in-flight selection for duplicate callers', async () => {
    let finish!: () => void
    const restart = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const service = serviceFixture(restart)
    const first = service.select('team')
    const second = service.select('team')
    expect(second).toBe(first)
    finish()
    await first
    expect(restart).toHaveBeenCalledOnce()
  })

  it('does not allow another target to overwrite an in-flight selection', async () => {
    let finish!: () => void
    const service = serviceFixture(() => new Promise<void>(resolve => { finish = resolve }))
    const selection = service.select('team')
    await expect(service.select('web')).rejects.toThrow(/already being selected/u)
    finish()
    await selection
  })

  it('rejects calls through a disposed generation reference', async () => {
    const service = serviceFixture(async () => {})
    service.dispose()
    expect(() => service.list()).toThrow(/disposed/u)
    await expect(service.select('team')).rejects.toThrow(/disposed/u)
  })
})
