import { describe, expect, it, vi } from 'vitest'
import { DeepRunnerGenerationCoordinator } from '../src/generation-coordinator.js'

describe('DeepRunnerGenerationCoordinator', () => {
  it('disposes before a normal exit', async () => {
    const calls: string[] = []
    const coordinator = new DeepRunnerGenerationCoordinator({
      prepareToQuit: () => { calls.push('prepare') },
      relaunch: () => { calls.push('relaunch') },
      exit: code => { calls.push(`exit:${code}`) },
    })
    await coordinator.start(async () => ({
      dispose: async () => { calls.push('dispose') },
    }))
    await coordinator.requestExit(0)
    expect(calls).toEqual(['dispose', 'prepare', 'exit:0'])
  })

  it('relaunches only after a successful zero-code disposal', async () => {
    const relaunch = vi.fn()
    const exit = vi.fn()
    const coordinator = new DeepRunnerGenerationCoordinator({
      prepareToQuit: vi.fn(),
      relaunch,
      exit,
    })
    await coordinator.start(async () => ({ dispose: async () => {} }))
    await coordinator.requestExit(0, { relaunch: true })
    expect(relaunch).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledWith(0)
  })

  it('converts disposal failure to a non-zero exit', async () => {
    const exit = vi.fn()
    const coordinator = new DeepRunnerGenerationCoordinator({
      prepareToQuit: vi.fn(),
      relaunch: vi.fn(),
      exit,
    })
    await coordinator.start(async () => ({
      dispose: async () => { throw new Error('dispose failed') },
    }))
    await coordinator.requestExit(0)
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('fences an in-flight startup into the shutdown disposer', async () => {
    const calls: string[] = []
    let finishStartup!: (generation: { dispose(): Promise<void> }) => void
    const startup = new Promise<{ dispose(): Promise<void> }>((resolve) => {
      finishStartup = resolve
    })
    const coordinator = new DeepRunnerGenerationCoordinator({
      prepareToQuit: () => { calls.push('prepare') },
      relaunch: () => { calls.push('relaunch') },
      exit: code => { calls.push(`exit:${code}`) },
    })

    const startTask = coordinator.start(async () => startup)
    const exitTask = coordinator.requestExit(0)
    finishStartup({ dispose: async () => { calls.push('dispose') } })

    await Promise.all([startTask, exitTask])
    expect(coordinator.status).toBe('stopped')
    expect(calls).toEqual(['dispose', 'prepare', 'exit:0'])
  })

  it('adopts and disposes a recovery generation after startup failure', async () => {
    const calls: string[] = []
    const coordinator = new DeepRunnerGenerationCoordinator({
      prepareToQuit: () => { calls.push('prepare') },
      relaunch: () => { calls.push('relaunch') },
      exit: code => { calls.push(`exit:${code}`) },
    })
    await expect(coordinator.start(async () => { throw new Error('boot failed') }))
      .rejects.toThrow('boot failed')
    await coordinator.recover(async () => ({
      dispose: async () => { calls.push('dispose-recovery') },
    }))
    expect(coordinator.status).toBe('running')
    await coordinator.requestExit(0, { relaunch: true })
    expect(calls).toEqual(['dispose-recovery', 'prepare', 'relaunch', 'exit:0'])
  })

  it('can relaunch directly after a failed startup without awaiting it again', async () => {
    const calls: string[] = []
    const coordinator = new DeepRunnerGenerationCoordinator({
      prepareToQuit: () => { calls.push('prepare') },
      relaunch: () => { calls.push('relaunch') },
      exit: code => { calls.push(`exit:${code}`) },
    })
    await expect(coordinator.start(async () => { throw new Error('boot failed') }))
      .rejects.toThrow('boot failed')
    await coordinator.requestExit(0, { relaunch: true })
    expect(calls).toEqual(['prepare', 'relaunch', 'exit:0'])
  })
})
