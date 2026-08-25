import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { delimiter, dirname, isAbsolute, join } from 'node:path'
import type {
  DeepRunnerPackages,
  DeepRunnerProcessHandle,
  DeepRunnerProcessOutcome,
  DeepRunnerProfiles,
} from '@deeprunner/contracts'
import type {
  SubprocessHandle,
  SubprocessRuntime,
  SubprocessSpawnSpec,
} from '@deepseek-ai/dsh-subprocess'
import { isMap, parseDocument } from 'yaml'

export const DEEPRUNNER_PACKAGE_OPERATION_DEADLINE_MS = 15 * 60 * 1000
export const DEEPRUNNER_PACKAGE_TERMINATION_GRACE_MS = 5_000
const MAX_WORKSPACE_CONFIG_BYTES = 256 * 1024
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u

interface PackageManifest {
  readonly bin?: string | Readonly<Record<string, string>>
}

export interface DeepRunnerPackageServiceOptions {
  readonly profiles: DeepRunnerProfiles
  readonly subprocess: Pick<SubprocessRuntime, 'spawn'>
  readonly executablePath?: string
  readonly dshEntryPath?: string
  readonly pnpmEntryPath?: string
  readonly deadlineMs?: number
  readonly terminationGraceMs?: number
  /** Existing command directory used by deterministic tests and native adapters. */
  readonly pnpmCommandDir?: string
}

function physicalPath(filename: string): string {
  return filename.replace(/([\\/])app\.asar\1/u, '$1app.asar.unpacked$1')
}

function resolvePackageManifest(packageName: string): string {
  const resolve = createRequire(import.meta.url).resolve
  try {
    return resolve(`${packageName}/package.json`)
  } catch (manifestCause) {
    let directory: string
    try {
      directory = dirname(resolve(packageName))
    } catch {
      throw manifestCause
    }
    while (true) {
      try {
        const candidate = join(directory, 'package.json')
        const manifest: unknown = JSON.parse(readFileSync(candidate, 'utf8'))
        if (manifest !== null
          && typeof manifest === 'object'
          && (manifest as { name?: unknown }).name === packageName) {
          return candidate
        }
      } catch {
        // Continue until the manifest owning the exported entry is found.
      }
      const parent = dirname(directory)
      if (parent === directory) throw manifestCause
      directory = parent
    }
  }
}

function resolveBinEntry(packageName: string, binName: string): string {
  const manifestPath = resolvePackageManifest(packageName)
  const manifest: PackageManifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const relative = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[binName]
  if (relative === undefined || relative.length === 0) {
    throw new Error(`DeepRunner runtime package ${packageName} has no ${binName} executable`)
  }
  return physicalPath(join(dirname(manifestPath), relative))
}

function validateDuration(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
  return value
}

function copyArguments(args: readonly string[]): string[] {
  if (!Array.isArray(args)) throw new TypeError('DeepRunner package arguments must be an array')
  return args.map((argument) => {
    if (typeof argument !== 'string' || argument.includes('\0')) {
      throw new TypeError('DeepRunner package arguments must be NUL-free strings')
    }
    return argument
  })
}

function copyPackageNames(packageNames: readonly string[]): string[] {
  if (!Array.isArray(packageNames) || packageNames.length > 32) {
    throw new TypeError('DeepRunner build script allowlist must be a bounded array')
  }
  const copied = packageNames.map((packageName) => {
    if (typeof packageName !== 'string' || !PACKAGE_NAME_PATTERN.test(packageName)) {
      throw new TypeError('DeepRunner build script allowlist contains an invalid package name')
    }
    return packageName
  })
  if (new Set(copied).size !== copied.length) {
    throw new TypeError('DeepRunner build script allowlist contains duplicates')
  }
  return copied
}

function writeWorkspaceConfig(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${String(process.pid)}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    renameSync(temporary, path)
  } finally {
    rmSync(temporary, { force: true })
  }
}

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

function createPnpmCommandDir(executablePath: string, pnpmEntryPath: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'deeprunner-package-tools-'))
  chmodSync(directory, 0o700)
  try {
    if (process.platform === 'win32') {
      writeFileSync(join(directory, 'pnpm.cmd'), [
        '@echo off',
        'set ELECTRON_RUN_AS_NODE=1',
        `"${executablePath}" "${pnpmEntryPath}" %*`,
        '',
      ].join('\r\n'), { encoding: 'utf8', flag: 'wx', mode: 0o700 })
    } else {
      const commandPath = join(directory, 'pnpm')
      writeFileSync(commandPath, [
        '#!/bin/sh',
        `ELECTRON_RUN_AS_NODE=1 exec ${shellSingleQuote(executablePath)} ${shellSingleQuote(pnpmEntryPath)} "$@"`,
        '',
      ].join('\n'), { encoding: 'utf8', flag: 'wx', mode: 0o700 })
      chmodSync(commandPath, 0o700)
    }
    return directory
  } catch (cause) {
    rmSync(directory, { recursive: true, force: true })
    throw cause
  }
}

/** Generation-scoped owner for every pnpm and DSH plugin mutation. */
export class DeepRunnerPackageService implements DeepRunnerPackages {
  private readonly profiles: DeepRunnerProfiles
  private readonly subprocess: Pick<SubprocessRuntime, 'spawn'>
  private readonly executablePath: string
  private readonly dshEntryPath: string
  private readonly pnpmEntryPath: string
  private readonly deadlineMs: number
  private readonly terminationGraceMs: number
  private readonly configuredPnpmCommandDir: string | undefined
  private ownedPnpmCommandDir: string | undefined
  private active: { readonly cancel: () => void; readonly done: Promise<DeepRunnerProcessOutcome> } | undefined
  private disposed = false

  constructor(options: DeepRunnerPackageServiceOptions) {
    this.profiles = options.profiles
    this.subprocess = options.subprocess
    this.executablePath = physicalPath(options.executablePath ?? process.execPath)
    this.dshEntryPath = physicalPath(options.dshEntryPath ?? resolveBinEntry('@deepseek-ai/dsh', 'dsh'))
    this.pnpmEntryPath = physicalPath(options.pnpmEntryPath ?? resolveBinEntry('pnpm', 'pnpm'))
    this.deadlineMs = validateDuration(
      options.deadlineMs ?? DEEPRUNNER_PACKAGE_OPERATION_DEADLINE_MS,
      'DeepRunner package deadline',
    )
    this.terminationGraceMs = validateDuration(
      options.terminationGraceMs ?? DEEPRUNNER_PACKAGE_TERMINATION_GRACE_MS,
      'DeepRunner package termination grace',
    )
    if (options.pnpmCommandDir !== undefined && !isAbsolute(options.pnpmCommandDir)) {
      throw new Error('DeepRunner pnpm command directory must be absolute')
    }
    this.configuredPnpmCommandDir = options.pnpmCommandDir
  }

  allowBuildScripts(packageNames: readonly string[]): void {
    const allowed = copyPackageNames(packageNames)
    if (allowed.length === 0) return
    this.assertAvailable()
    const path = join(this.profiles.current.dir, 'pnpm-workspace.yaml')
    const source = existsSync(path)
      ? (() => {
          if (statSync(path).size > MAX_WORKSPACE_CONFIG_BYTES) {
            throw new Error('DeepRunner Profile pnpm workspace config is too large')
          }
          return readFileSync(path, 'utf8')
        })()
      : 'packages:\n  - .\n'
    const document = parseDocument(source)
    if (document.errors.length > 0) {
      throw new Error(`DeepRunner Profile pnpm workspace config is invalid: ${document.errors[0]?.message ?? 'unknown YAML error'}`)
    }
    if (!isMap(document.contents)) {
      throw new Error('DeepRunner Profile pnpm workspace config must be a mapping')
    }
    const current = document.get('allowBuilds', true)
    if (current === undefined) {
      document.set('allowBuilds', document.createNode({}))
    } else if (!isMap(current)) {
      throw new Error('DeepRunner Profile allowBuilds must be a mapping')
    }
    for (const packageName of allowed) document.setIn(['allowBuilds', packageName], true)
    writeWorkspaceConfig(path, document.toString())
  }

  runPnpm(args: readonly string[], signal?: AbortSignal): DeepRunnerProcessHandle {
    const argv = copyArguments(args)
    return this.start([this.executablePath, this.pnpmEntryPath, ...argv], this.profiles.current.dir, signal)
  }

  runPlugin(
    args: readonly string[],
    invokingDir: string,
    signal?: AbortSignal,
  ): DeepRunnerProcessHandle {
    const argv = copyArguments(args)
    if (argv.length === 0) throw new Error('DeepRunner plugin operation requires pnpm arguments')
    if (typeof invokingDir !== 'string' || !isAbsolute(invokingDir) || invokingDir.includes('\0')) {
      throw new Error('DeepRunner plugin invoking directory must be an absolute NUL-free path')
    }
    this.assertAvailable()
    signal?.throwIfAborted()
    return this.start([
      this.executablePath,
      this.dshEntryPath,
      'plugin',
      '--profile',
      this.profiles.current.name,
      ...argv,
    ], invokingDir, signal, this.pnpmEnvironment())
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    const active = this.active
    if (active !== undefined) {
      active.cancel()
      await active.done.catch(() => {})
    }
    if (this.ownedPnpmCommandDir !== undefined) {
      rmSync(this.ownedPnpmCommandDir, { recursive: true, force: true })
      this.ownedPnpmCommandDir = undefined
    }
  }

  private pnpmEnvironment(): NodeJS.ProcessEnv {
    const directory = this.configuredPnpmCommandDir
      ?? (this.ownedPnpmCommandDir ??= createPnpmCommandDir(this.executablePath, this.pnpmEntryPath))
    const pathKey = Object.keys(process.env).find(key => key.toUpperCase() === 'PATH') ?? 'PATH'
    return { [pathKey]: `${directory}${delimiter}${process.env[pathKey] ?? ''}` }
  }

  private start(
    argv: readonly string[],
    cwd: string,
    signal?: AbortSignal,
    environment: NodeJS.ProcessEnv = {},
  ): DeepRunnerProcessHandle {
    this.assertAvailable()
    if (!isAbsolute(cwd)) throw new Error('DeepRunner package working directory must be absolute')
    signal?.throwIfAborted()

    const cancellation = new AbortController()
    const combinedSignal = signal === undefined
      ? cancellation.signal
      : AbortSignal.any([cancellation.signal, signal])
    let deadline: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => { cancellation.abort(new Error('DeepRunner package operation deadline exceeded')) },
      this.deadlineMs,
    )
    deadline.unref?.()

    let processHandle: SubprocessHandle
    try {
      const spec: SubprocessSpawnSpec = {
        argv,
        cwd,
        stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
        graceMs: this.terminationGraceMs,
        signal: combinedSignal,
        env: {
          ...environment,
          DSH_HOME: dirname(dirname(this.profiles.current.dir)),
          ELECTRON_RUN_AS_NODE: '1',
        },
      }
      processHandle = this.subprocess.spawn(spec)
    } catch (cause) {
      clearTimeout(deadline)
      deadline = undefined
      throw cause
    }
    const stdout = processHandle.stdout
    const stderr = processHandle.stderr
    if (stdout === undefined || stderr === undefined) {
      clearTimeout(deadline)
      processHandle.terminate()
      throw new Error('DeepRunner package subprocess did not provide piped output')
    }

    const done = processHandle.done.then(async (outcome) => {
      await processHandle.waitForExit()
      return outcome
    }).finally(() => {
      if (deadline !== undefined) clearTimeout(deadline)
      if (this.active?.done === done) this.active = undefined
    })
    const cancel = (): void => { cancellation.abort() }
    this.active = { cancel, done }
    return { stdout, stderr, done, cancel }
  }

  private assertAvailable(): void {
    if (this.disposed) throw new Error('DeepRunner Package service is disposed')
    if (this.active !== undefined) throw new Error('A DeepRunner package operation is already running')
  }
}
