import { spawn, type ChildProcess } from 'node:child_process'
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs'
import { basename, join } from 'node:path'
import type { DeepRunnerPlatform } from '@deeprunner/contracts/internal/runtime'

const DIRECTORY_MODE = 0o700
const EXECUTABLE_MODE = 0o700

export interface DeepRunnerTerminalRuntime {
  readonly rootDir: string
  readonly generationId: string
  readonly platform: DeepRunnerPlatform
  readonly version: string
  readonly profile: { readonly name: string; readonly dir: string }
  readonly executablePath: string
  readonly dshEntryPath: string
  readonly pnpmEntryPath: string
}

export interface DeepRunnerTerminalLaunch {
  readonly command: string
  readonly args: readonly string[]
}

export interface PreparedDeepRunnerTerminal {
  readonly directory: string
  readonly entryPath: string
  readonly launchCandidates: readonly DeepRunnerTerminalLaunch[]
}

function posixQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

function powershellQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function batchQuote(value: string): string {
  return `"${value.replaceAll('%', '%%')}"`
}

function ensurePrivateDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: DIRECTORY_MODE })
  const stat = lstatSync(path)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`DeepRunner Terminal directory is not private: ${path}`)
  }
  chmodSync(path, DIRECTORY_MODE)
}

function writeExecutable(path: string, content: string): void {
  writeFileSync(path, content, { encoding: 'utf8', flag: 'wx', mode: EXECUTABLE_MODE })
  chmodSync(path, EXECUTABLE_MODE)
}

function posixDshWrapper(runtime: DeepRunnerTerminalRuntime): string {
  const run = `${posixQuote(runtime.executablePath)} ${posixQuote(runtime.dshEntryPath)}`
  return [
    '#!/bin/sh',
    'if [ "${1-}" = plugin ]; then',
    '  shift',
    `  ELECTRON_RUN_AS_NODE=1 exec ${run} plugin --profile ${posixQuote(runtime.profile.name)} "$@"`,
    'fi',
    `ELECTRON_RUN_AS_NODE=1 exec ${run} --profile ${posixQuote(runtime.profile.name)} "$@"`,
    '',
  ].join('\n')
}

function posixPnpmWrapper(runtime: DeepRunnerTerminalRuntime): string {
  return [
    '#!/bin/sh',
    `cd ${posixQuote(runtime.profile.dir)} || exit 1`,
    `ELECTRON_RUN_AS_NODE=1 exec ${posixQuote(runtime.executablePath)} ${posixQuote(runtime.pnpmEntryPath)} "$@"`,
    '',
  ].join('\n')
}

function posixEntry(runtime: DeepRunnerTerminalRuntime, directory: string): string {
  return [
    '#!/bin/sh',
    `export DSH_HOME=${posixQuote(join(runtime.profile.dir, '..', '..'))}`,
    `export DEEPRUNNER_PROFILE=${posixQuote(runtime.profile.name)}`,
    `export PATH=${posixQuote(directory)}:"$PATH"`,
    `cd ${posixQuote(runtime.profile.dir)} || exit 1`,
    `printf '\\nDeepRunner ${runtime.version} — Profile: %s\\n' "$DEEPRUNNER_PROFILE"`,
    `printf 'Bundled commands: dsh, pnpm\\n\\n'`,
    'exec "${SHELL:-/bin/sh}" -i',
    '',
  ].join('\n')
}

function windowsDshWrapper(runtime: DeepRunnerTerminalRuntime): string {
  const executable = batchQuote(runtime.executablePath)
  const entry = batchQuote(runtime.dshEntryPath)
  const profile = batchQuote(runtime.profile.name)
  return [
    '@echo off',
    'set ELECTRON_RUN_AS_NODE=1',
    'if /I "%~1"=="plugin" goto plugin',
    `${executable} ${entry} --profile ${profile} %*`,
    'exit /b %ERRORLEVEL%',
    ':plugin',
    'shift',
    `${executable} ${entry} plugin --profile ${profile} %*`,
    '',
  ].join('\r\n')
}

function windowsPnpmWrapper(runtime: DeepRunnerTerminalRuntime): string {
  return [
    '@echo off',
    'set ELECTRON_RUN_AS_NODE=1',
    `pushd ${batchQuote(runtime.profile.dir)}`,
    `${batchQuote(runtime.executablePath)} ${batchQuote(runtime.pnpmEntryPath)} %*`,
    'set DEEPRUNNER_EXIT=%ERRORLEVEL%',
    'popd',
    'exit /b %DEEPRUNNER_EXIT%',
    '',
  ].join('\r\n')
}

function windowsEntry(runtime: DeepRunnerTerminalRuntime, directory: string): string {
  return [
    `$env:DSH_HOME = ${powershellQuote(join(runtime.profile.dir, '..', '..'))}`,
    `$env:DEEPRUNNER_PROFILE = ${powershellQuote(runtime.profile.name)}`,
    `$env:PATH = ${powershellQuote(`${directory};`)} + $env:PATH`,
    `Set-Location -LiteralPath ${powershellQuote(runtime.profile.dir)}`,
    `Write-Host ${powershellQuote(`DeepRunner ${runtime.version} — Profile: ${runtime.profile.name}`)}`,
    "Write-Host 'Bundled commands: dsh, pnpm'",
    '',
  ].join('\r\n')
}

/** Create one secret-free, generation-specific system-terminal environment. */
export function prepareDeepRunnerTerminal(runtime: DeepRunnerTerminalRuntime): PreparedDeepRunnerTerminal {
  if (!/^[0-9A-Za-z-]{1,80}$/u.test(runtime.generationId)) {
    throw new Error('DeepRunner Terminal generation id is invalid')
  }
  const terminalRoot = join(runtime.rootDir, 'terminal')
  const directory = join(terminalRoot, runtime.generationId)
  ensurePrivateDirectory(terminalRoot)
  ensurePrivateDirectory(directory)

  if (runtime.platform === 'win32') {
    writeExecutable(join(directory, 'dsh.cmd'), windowsDshWrapper(runtime))
    writeExecutable(join(directory, 'pnpm.cmd'), windowsPnpmWrapper(runtime))
    const entryPath = join(directory, 'DeepRunner-Terminal.ps1')
    writeExecutable(entryPath, windowsEntry(runtime, directory))
    const powershellArgs = ['-NoLogo', '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', entryPath]
    return {
      directory,
      entryPath,
      launchCandidates: [
        { command: 'wt.exe', args: ['powershell.exe', ...powershellArgs] },
        { command: 'powershell.exe', args: powershellArgs },
      ],
    }
  }

  writeExecutable(join(directory, 'dsh'), posixDshWrapper(runtime))
  writeExecutable(join(directory, 'pnpm'), posixPnpmWrapper(runtime))
  const entryPath = join(directory, 'DeepRunner-Terminal.command')
  writeExecutable(entryPath, posixEntry(runtime, directory))
  return {
    directory,
    entryPath,
    launchCandidates: runtime.platform === 'darwin' ? [] : [
      { command: 'x-terminal-emulator', args: ['-e', entryPath] },
      { command: 'gnome-terminal', args: ['--', entryPath] },
      { command: 'konsole', args: ['-e', entryPath] },
      { command: 'xterm', args: ['-e', entryPath] },
    ],
  }
}

export type DeepRunnerTerminalSpawn = (
  command: string,
  args: readonly string[],
  options: { readonly detached: true; readonly stdio: 'ignore'; readonly windowsHide: true },
) => Pick<ChildProcess, 'once' | 'unref'>

/** Start the first installed Windows/Linux terminal without using a shell string. */
export async function launchDeepRunnerTerminal(
  candidates: readonly DeepRunnerTerminalLaunch[],
  spawnProcess: DeepRunnerTerminalSpawn = spawn,
): Promise<void> {
  const failures: unknown[] = []
  for (const candidate of candidates) {
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawnProcess(candidate.command, candidate.args, {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        })
        child.once('spawn', () => { child.unref(); resolve() })
        child.once('error', reject)
      })
      return
    } catch (cause) {
      failures.push(cause)
    }
  }
  throw new AggregateError(failures, `No supported DeepRunner Terminal is installed (${candidates.map(value => basename(value.command)).join(', ')})`)
}
