import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { Entry } from '@deepseek-ai/cordis-plugin-loader'
import { Include } from '@deepseek-ai/cordis-plugin-include'
import { parse } from 'yaml'
import type {
  DeepRunnerMarketOperationActivation,
  DeepRunnerMarketOperationKind,
} from './contract.js'

const HOT_DIRECTORY = '.deeprunner-market-hot'
const HOT_MOUNT_TIMEOUT_MS = 10_000

interface HotRow {
  readonly id: string
  readonly name: string
}

interface PluginHandle {
  await(): Promise<unknown>
  dispose(): Promise<unknown> | void
}

interface HotContext {
  readonly loader: Context['loader']
  readonly logger: Context['logger']
  plugin(plugin: unknown, config: unknown): PluginHandle
}

class DeepRunnerMarketHotTree extends Include {
  override write(): void {}

  override import(name: string, getOuterStack?: () => string[]): unknown {
    if (clientOnlyPackages.has(name)) return { name, apply: () => {} }
    return super.import(name, getOuterStack)
  }
}

const clientOnlyPackages = new Set<string>()

function restartRequired(reason: string): DeepRunnerMarketOperationActivation {
  return { status: 'restart-required', reason }
}

function live(): DeepRunnerMarketOperationActivation {
  return { status: 'live' }
}

/** Accept only a patch made entirely from top-level, plain insert rows. */
export function parseDeepRunnerHotPatch(source: string): readonly HotRow[] | undefined {
  let value: unknown
  try {
    value = parse(source)
  } catch {
    return undefined
  }
  if (!Array.isArray(value) || value.length === 0) return undefined
  const rows: HotRow[] = []
  for (const patch of value) {
    if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return undefined
    const keys = Object.keys(patch)
    if (keys.length !== 1 || keys[0] !== 'insert') return undefined
    const insert = (patch as { insert?: unknown }).insert
    if (!Array.isArray(insert) || insert.length === 0) return undefined
    for (const row of insert) {
      if (row === null || typeof row !== 'object' || Array.isArray(row)) return undefined
      const record = row as Record<string, unknown>
      if (Object.keys(record).some(key => key !== 'id' && key !== 'name')
        || typeof record.id !== 'string' || record.id.length === 0
        || typeof record.name !== 'string' || record.name.length === 0) {
        return undefined
      }
      rows.push({ id: record.id, name: record.name })
    }
  }
  return rows.length === 0 ? undefined : rows
}

function installedSurface(profileDir: string, packageName: string): {
  readonly patch?: readonly HotRow[]
  readonly clientOnly: boolean
} | undefined {
  const packageDir = join(profileDir, 'node_modules', packageName)
  let manifest: { dsh?: { client?: unknown; bundle?: { patch?: unknown } } }
  try {
    manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as typeof manifest
  } catch {
    return undefined
  }
  const patchPath = manifest.dsh?.bundle?.patch
  if (typeof patchPath === 'string') {
    try {
      const filename = resolve(packageDir, patchPath)
      const outside = relative(packageDir, filename)
      if (outside.startsWith('..') || outside.startsWith('/')) return undefined
      const patch = parseDeepRunnerHotPatch(readFileSync(filename, 'utf8'))
      return patch === undefined ? undefined : { patch, clientOnly: false }
    } catch {
      return undefined
    }
  }
  return manifest.dsh?.bundle === undefined && manifest.dsh?.client !== undefined
    ? { clientOnly: true }
    : undefined
}

async function settle(handle: PluginHandle): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      handle.await(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { reject(new Error('activation timed out')) }, HOT_MOUNT_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

function disposeHandle(handle: PluginHandle): Promise<unknown> {
  return Promise.resolve().then(() => handle.dispose())
}

/** Owns current-generation hot mounts and live loader toggles for the Market. */
export class DeepRunnerMarketHotActivationService {
  private readonly handles = new Map<string, PluginHandle>()
  private sequence = 0

  constructor(
    private readonly ctx: HotContext,
    private readonly profileDir: string,
  ) {
    rmSync(join(profileDir, HOT_DIRECTORY), { recursive: true, force: true })
  }

  async apply(
    kind: DeepRunnerMarketOperationKind,
    packageName: string,
  ): Promise<DeepRunnerMarketOperationActivation> {
    try {
      if (kind === 'update' || kind === 'switch') {
        return restartRequired('Updated plugin code is activated on restart')
      }
      if (kind === 'remove' || kind === 'disable') {
        const removed = await this.unmount(packageName)
        const toggled = await this.setLoaderDisabled(packageName, true)
        return removed || toggled || kind === 'remove'
          ? live()
          : restartRequired('No matching live plugin entry was found')
      }
      if (kind === 'enable') {
        if (await this.setLoaderDisabled(packageName, false)) return live()
      }
      return await this.mount(packageName)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      this.ctx.logger.warn(`DeepRunner market could not apply ${packageName} live: ${message}`)
      return restartRequired(`Live activation failed: ${message}`)
    }
  }

  async dispose(): Promise<void> {
    await Promise.allSettled([...this.handles.values()].map(disposeHandle))
    this.handles.clear()
    clientOnlyPackages.clear()
    rmSync(join(this.profileDir, HOT_DIRECTORY), { recursive: true, force: true })
  }

  private async mount(packageName: string): Promise<DeepRunnerMarketOperationActivation> {
    if (this.handles.has(packageName)) return live()
    const surface = installedSurface(this.profileDir, packageName)
    if (surface === undefined) {
      return restartRequired('The plugin has no simple insert-only patch that can be hot-mounted')
    }
    const rows = surface.clientOnly
      ? [{ id: `client-${packageName.replace(/[^A-Za-z0-9_.-]/gu, '-')}`, name: packageName }]
      : surface.patch ?? []
    const directory = join(this.profileDir, HOT_DIRECTORY)
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    this.sequence += 1
    const filename = join(directory, `hot-${String(this.sequence)}.yml`)
    writeFileSync(filename, JSON.stringify(rows.map(row => ({
      id: `market-${row.id}`,
      name: row.name,
    }))), { encoding: 'utf8', mode: 0o600 })
    if (surface.clientOnly) clientOnlyPackages.add(packageName)
    const handle = this.ctx.plugin(DeepRunnerMarketHotTree, { path: pathToFileURL(filename).href })
    try {
      await settle(handle)
    } catch (cause) {
      await disposeHandle(handle).catch(() => {})
      clientOnlyPackages.delete(packageName)
      throw cause
    }
    this.handles.set(packageName, handle)
    this.ctx.logger.info(`DeepRunner market hot-mounted ${packageName}`)
    return live()
  }

  private async unmount(packageName: string): Promise<boolean> {
    const handle = this.handles.get(packageName)
    if (handle === undefined) return false
    this.handles.delete(packageName)
    await handle.dispose()
    clientOnlyPackages.delete(packageName)
    return true
  }

  private async setLoaderDisabled(packageName: string, disabled: boolean): Promise<boolean> {
    const entries = [...this.ctx.loader.entries()]
      .filter((entry: Entry) => entry.options.name === packageName)
    for (const entry of entries) {
      await entry.update({ disabled: disabled ? true : null }, false, true)
    }
    return entries.length > 0
  }
}
