import { PassThrough } from 'node:stream'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  SubprocessHandle,
  SubprocessOutcome,
  SubprocessSpawnSpec,
} from '@deepseek-ai/dsh-subprocess'
import { parseDeepRunnerProfileName } from '@deeprunner/contracts'
import { DeepRunnerPackageService } from '../src/package-service.js'

function deferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
  readonly reject: (cause: unknown) => void
} {
  let resolvePromise!: (value: T) => void
  let rejectPromise!: (cause: unknown) => void
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return { promise, resolve: resolvePromise, reject: rejectPromise }
}

const temporaryDirectories: string[] = []

function fixture(resolveRuntimeEntries = false, profileDirOverride?: string) {
  const leader = deferred<SubprocessOutcome>()
  const tree = deferred<boolean>()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  let spec: SubprocessSpawnSpec | undefined
  const terminate = vi.fn()
  const waitForExit = vi.fn(() => tree.promise)
  const subprocess = {
    spawn: vi.fn((value: SubprocessSpawnSpec): SubprocessHandle => {
      spec = value
      value.signal?.addEventListener('abort', terminate, { once: true })
      return {
        pid: 42,
        stdin: undefined,
        stdout,
        stderr,
        collected: {},
        done: leader.promise,
        terminate,
        waitForExit,
      }
    }),
  }
  const profileDir = profileDirOverride ?? resolve('/tmp/deeprunner package test/home/profiles/team')
  const service = new DeepRunnerPackageService({
    profiles: {
      current: { name: parseDeepRunnerProfileName('team'), dir: profileDir },
      list: () => [],
      select: async () => {},
    },
    subprocess,
    ...(resolveRuntimeEntries ? {} : {
      executablePath: resolve('/runtime/DeepRunner'),
      dshEntryPath: resolve('/runtime/dsh.js'),
      pnpmEntryPath: resolve('/runtime/pnpm.mjs'),
    }),
    deadlineMs: 1_000,
    terminationGraceMs: 25,
    pnpmCommandDir: resolve('/runtime/bin'),
  })
  return {
    leader,
    tree,
    stdout,
    stderr,
    subprocess,
    terminate,
    waitForExit,
    service,
    spec: () => spec,
  }
}

afterEach(() => {
  vi.useRealTimers()
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('DeepRunner Package service', () => {
  it('resolves bin entries from packages that hide their manifest export', async () => {
    const test = fixture(true)
    const handle = test.service.runPnpm(['--version'])
    expect(test.spec()?.argv[0]).toBe(process.execPath)
    expect(test.spec()?.argv[1]).toMatch(/[/\\]pnpm[/\\]bin[/\\]pnpm\.mjs$/u)
    test.leader.resolve({ exitCode: 0, signal: null })
    test.tree.resolve(true)
    await handle.done
  })

  it('runs bundled pnpm in the immutable current Profile', async () => {
    const test = fixture()
    const handle = test.service.runPnpm(['install', '--frozen-lockfile'])
    expect(handle.stdout).toBe(test.stdout)
    expect(handle.stderr).toBe(test.stderr)
    expect(test.spec()).toMatchObject({
      argv: ['/runtime/DeepRunner', '/runtime/pnpm.mjs', 'install', '--frozen-lockfile'],
      cwd: '/tmp/deeprunner package test/home/profiles/team',
      graceMs: 25,
      stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
      env: {
        DSH_HOME: '/tmp/deeprunner package test/home',
        ELECTRON_RUN_AS_NODE: '1',
      },
    })
    test.leader.resolve({ exitCode: 0, signal: null })
    test.tree.resolve(true)
    await expect(handle.done).resolves.toEqual({ exitCode: 0, signal: null })
  })

  it('anchors official dsh plugin arguments at the invoking directory', async () => {
    const test = fixture()
    const invokingDir = resolve('/tmp/plugin source')
    const handle = test.service.runPlugin(['add', 'file:../fixture'], invokingDir)
    expect(test.spec()?.argv).toEqual([
      '/runtime/DeepRunner',
      '/runtime/dsh.js',
      'plugin',
      '--profile',
      'team',
      'add',
      'file:../fixture',
    ])
    expect(test.spec()?.cwd).toBe('/tmp/plugin source')
    const pathKey = Object.keys(process.env).find(key => key.toUpperCase() === 'PATH') ?? 'PATH'
    expect(test.spec()?.env?.[pathKey]).toMatch(/^[/\\]runtime[/\\]bin/u)
    test.leader.resolve({ exitCode: 0, signal: null })
    test.tree.resolve(true)
    await handle.done
  })

  it('merges an explicit build-script allowlist into the Profile workspace config', () => {
    const root = mkdtempSync(join(tmpdir(), 'deeprunner-build-policy-'))
    temporaryDirectories.push(root)
    const profileDir = join(root, 'home', 'profiles', 'team')
    mkdirSync(profileDir, { recursive: true })
    writeFileSync(join(profileDir, 'pnpm-workspace.yaml'), [
      'packages:',
      '  - .',
      'nodeLinker: hoisted',
      'allowBuilds:',
      '  existing-native: false',
      '  node-pty: set this to true or false',
      '',
    ].join('\n'))
    const test = fixture(false, profileDir)

    test.service.allowBuildScripts(['node-pty', '@scope/native-addon'])

    const result = readFileSync(join(profileDir, 'pnpm-workspace.yaml'), 'utf8')
    expect(result).toContain('existing-native: false')
    expect(result).toContain('node-pty: true')
    expect(result).toContain('"@scope/native-addon": true')
    expect(result).toContain('nodeLinker: hoisted')
    expect(test.subprocess.spawn).not.toHaveBeenCalled()
  })

  it('keeps the busy gate until the complete process tree exits', async () => {
    const test = fixture()
    const first = test.service.runPnpm(['install'])
    expect(() => test.service.runPnpm(['remove', 'fixture'])).toThrow(/already running/u)
    test.leader.resolve({ exitCode: 0, signal: null })
    await Promise.resolve()
    expect(() => test.service.runPnpm(['remove', 'fixture'])).toThrow(/already running/u)
    test.tree.resolve(true)
    await first.done

    const second = test.service.runPnpm(['remove', 'fixture'])
    expect(test.subprocess.spawn).toHaveBeenCalledTimes(2)
    test.leader.resolve({ exitCode: 0, signal: null })
    await second.done
  })

  it('routes cancel, AbortSignal, deadline, and dispose through the tree owner', async () => {
    vi.useFakeTimers()
    const cancelled = fixture()
    cancelled.service.runPnpm(['install']).cancel()
    expect(cancelled.terminate).toHaveBeenCalledOnce()

    const external = fixture()
    const controller = new AbortController()
    external.service.runPnpm(['install'], controller.signal)
    controller.abort()
    expect(external.terminate).toHaveBeenCalledOnce()

    const expired = fixture()
    expired.service.runPnpm(['install'])
    await vi.advanceTimersByTimeAsync(1_000)
    expect(expired.terminate).toHaveBeenCalledOnce()

    const disposed = fixture()
    const disposingHandle = disposed.service.runPnpm(['install'])
    const disposing = disposed.service.dispose()
    expect(disposed.terminate).toHaveBeenCalledOnce()
    disposed.leader.resolve({ exitCode: null, signal: 'SIGTERM' })
    disposed.tree.resolve(true)
    await Promise.all([disposingHandle.done, disposing])
    expect(() => disposed.service.runPnpm(['install'])).toThrow(/disposed/u)
  })

  it('rejects unsafe inputs before spawning', () => {
    const test = fixture()
    expect(() => test.service.runPlugin([], resolve('/tmp'))).toThrow(/requires pnpm arguments/u)
    expect(() => test.service.runPlugin(['add', 'bad\0spec'], resolve('/tmp'))).toThrow(/NUL-free/u)
    expect(() => test.service.runPlugin(['add', 'fixture'], 'relative')).toThrow(/absolute/u)
    expect(() => test.service.allowBuildScripts(['bad package'])).toThrow(/invalid package/u)
    expect(test.subprocess.spawn).not.toHaveBeenCalled()
  })
})
