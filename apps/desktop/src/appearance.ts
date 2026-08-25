import { randomUUID } from 'node:crypto'
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { DeepRunnerThemeSource } from '@deeprunner/contracts/internal/runtime'

const DIRECTORY_MODE = 0o700
const FILE_MODE = 0o600

export interface DeepRunnerAppearanceState {
  readonly version: 1
  readonly themeSource: DeepRunnerThemeSource
}

function parseThemeSource(value: unknown): DeepRunnerThemeSource {
  if (value !== 'system' && value !== 'light' && value !== 'dark') {
    throw new Error(`invalid DeepRunner theme source ${JSON.stringify(value)}`)
  }
  return value
}

export function readDeepRunnerAppearance(statePath: string): DeepRunnerAppearanceState {
  try {
    if (lstatSync(statePath).isSymbolicLink()) throw new Error('appearance state must not be a symlink')
    const value: unknown = JSON.parse(readFileSync(statePath, 'utf8'))
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid appearance state')
    const record = value as Record<string, unknown>
    if (record.version !== 1) throw new Error('unsupported appearance state version')
    return { version: 1, themeSource: parseThemeSource(record.themeSource) }
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT' || cause instanceof SyntaxError) {
      return { version: 1, themeSource: 'system' }
    }
    if (cause instanceof Error && (
      cause.message.startsWith('invalid')
      || cause.message.startsWith('unsupported')
      || cause.message.includes('symlink')
    )) return { version: 1, themeSource: 'system' }
    throw cause
  }
}

export function writeDeepRunnerAppearance(
  statePath: string,
  themeSource: DeepRunnerThemeSource,
): DeepRunnerAppearanceState {
  const state: DeepRunnerAppearanceState = { version: 1, themeSource: parseThemeSource(themeSource) }
  const stateDir = dirname(statePath)
  mkdirSync(stateDir, { recursive: true, mode: DIRECTORY_MODE })
  const stat = lstatSync(stateDir)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('DeepRunner appearance directory is not private')
  chmodSync(stateDir, DIRECTORY_MODE)
  const temporary = join(stateDir, `.${basename(statePath)}.${process.pid}.${randomUUID()}.tmp`)
  try {
    writeFileSync(temporary, `${JSON.stringify(state, undefined, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: FILE_MODE,
    })
    chmodSync(temporary, FILE_MODE)
    renameSync(temporary, statePath)
  } finally {
    try { unlinkSync(temporary) } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause
    }
  }
  return state
}
