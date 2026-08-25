import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import {
  installDeepRunnerShutdownRequests,
  type DeepRunnerQuitEvent,
} from '../src/shutdown-requests.js'

describe('installDeepRunnerShutdownRequests', () => {
  it('routes signals and native quit through one request callback', () => {
    const signals = new EventEmitter()
    const nativeApp = new EventEmitter()
    const requestExit = vi.fn()
    const preventDefault = vi.fn()
    const remove = installDeepRunnerShutdownRequests(signals, nativeApp, requestExit)

    signals.emit('SIGINT')
    signals.emit('SIGTERM')
    nativeApp.emit('before-quit', { preventDefault } satisfies DeepRunnerQuitEvent)

    expect(requestExit.mock.calls).toEqual([[130], [0], [0]])
    expect(preventDefault).toHaveBeenCalledOnce()
    remove()
    remove()
    signals.emit('SIGTERM')
    nativeApp.emit('before-quit', { preventDefault } satisfies DeepRunnerQuitEvent)
    expect(requestExit).toHaveBeenCalledTimes(3)
  })
})
