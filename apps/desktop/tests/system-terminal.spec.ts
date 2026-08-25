import { EventEmitter } from 'node:events'
import { lstatSync, mkdtempSync, readFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  launchDeepRunnerTerminal,
  prepareDeepRunnerTerminal,
  type DeepRunnerTerminalRuntime,
  type DeepRunnerTerminalSpawn,
} from '../src/system-terminal.js'

function runtime(platform: DeepRunnerTerminalRuntime['platform'], rootDir?: string): DeepRunnerTerminalRuntime {
  const windows = platform === 'win32'
  return {
    rootDir: rootDir ?? mkdtempSync(join(tmpdir(), 'deeprunner-terminal-test-')),
    generationId: `generation-${platform}`,
    platform,
    version: '1.2.3',
    profile: {
      name: 'team profile',
      dir: windows
        ? 'C:\\DeepRunner Profile\\home\\profiles\\team profile'
        : '/tmp/DeepRunner Profile/home/profiles/team profile',
    },
    executablePath: windows
      ? "C:\\Program Files\\DeepRunner's Test\\DeepRunner.exe"
      : "/Applications/DeepRunner's Test.app/DeepRunner",
    dshEntryPath: windows ? 'C:\\runtime\\DSH Files\\bin.js' : '/runtime/DSH Files/bin.js',
    pnpmEntryPath: windows ? 'C:\\runtime\\pnpm Files\\pnpm.mjs' : '/runtime/pnpm Files/pnpm.mjs',
  }
}

describe('DeepRunner system Terminal', () => {
  it('writes a private POSIX environment with quoted bundled commands', () => {
    const prepared = prepareDeepRunnerTerminal(runtime('darwin'))
    expect(prepared.launchCandidates).toEqual([])
    expect(prepared.entryPath).toMatch(/DeepRunner-Terminal\.command$/u)
    const directoryStat = lstatSync(prepared.directory)
    expect(directoryStat.isDirectory()).toBe(true)
    // Windows reports synthesized POSIX mode bits and cannot represent 0700.
    if (process.platform !== 'win32') expect(directoryStat.mode & 0o777).toBe(0o700)

    const entry = readFileSync(prepared.entryPath, 'utf8')
    const dsh = readFileSync(join(prepared.directory, 'dsh'), 'utf8')
    const pnpm = readFileSync(join(prepared.directory, 'pnpm'), 'utf8')
    expect(entry).toContain("export DEEPRUNNER_PROFILE='team profile'")
    expect(entry).toContain('Bundled commands: dsh, pnpm')
    expect(dsh).toContain("DeepRunner'\\''s Test.app/DeepRunner'")
    expect(dsh).toContain("plugin --profile 'team profile'")
    expect(pnpm).toContain("cd '/tmp/DeepRunner Profile/home/profiles/team profile'")
    expect(`${entry}${dsh}${pnpm}`).not.toMatch(/API[_-]?KEY|TOKEN|SECRET/iu)
  })

  it('builds Windows Terminal and PowerShell fallback argv without shell text', () => {
    const prepared = prepareDeepRunnerTerminal(runtime('win32'))
    expect(prepared.launchCandidates).toEqual([
      {
        command: 'wt.exe',
        args: ['powershell.exe', '-NoLogo', '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', prepared.entryPath],
      },
      {
        command: 'powershell.exe',
        args: ['-NoLogo', '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', prepared.entryPath],
      },
    ])
    expect(readFileSync(join(prepared.directory, 'dsh.cmd'), 'utf8')).toContain(':plugin')
    expect(readFileSync(prepared.entryPath, 'utf8')).toContain("$env:DEEPRUNNER_PROFILE = 'team profile'")
  })

  it('provides a bounded Linux terminal discovery order', () => {
    const prepared = prepareDeepRunnerTerminal(runtime('linux'))
    expect(prepared.launchCandidates.map(candidate => candidate.command)).toEqual([
      'x-terminal-emulator',
      'gnome-terminal',
      'konsole',
      'xterm',
    ])
    expect(prepared.launchCandidates.every(candidate => candidate.args.includes(prepared.entryPath))).toBe(true)
  })

  it('rejects a replaced private Terminal directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'deeprunner-terminal-symlink-'))
    const target = mkdtempSync(join(tmpdir(), 'deeprunner-terminal-target-'))
    symlinkSync(target, join(root, 'terminal'))
    expect(() => prepareDeepRunnerTerminal(runtime('darwin', root))).toThrow(/not private/u)
  })

  it('falls back after an unavailable terminal and detaches the winner', async () => {
    const unref = vi.fn()
    const spawnProcess = vi.fn(((command: string) => {
      const child = new EventEmitter() as EventEmitter & { unref(): void }
      child.unref = unref
      queueMicrotask(() => {
        if (command === 'missing') child.emit('error', new Error('ENOENT'))
        else child.emit('spawn')
      })
      return child
    }) as DeepRunnerTerminalSpawn)
    await launchDeepRunnerTerminal([
      { command: 'missing', args: [] },
      { command: 'available', args: ['--safe'] },
    ], spawnProcess)
    expect(spawnProcess).toHaveBeenCalledTimes(2)
    expect(spawnProcess).toHaveBeenLastCalledWith('available', ['--safe'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    expect(unref).toHaveBeenCalledOnce()
  })
})
