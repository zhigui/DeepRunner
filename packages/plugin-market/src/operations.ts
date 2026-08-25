import { randomUUID } from 'node:crypto'
import { finished } from 'node:stream/promises'
import type {
  DeepRunnerPackages,
  DeepRunnerProcessHandle,
  DeepRunnerProcessOutcome,
  DeepRunnerProfiles,
} from '@deeprunner/contracts'
import type { DeepRunnerRuntimeIdentity } from '@deeprunner/contracts/internal/runtime'
import type { DeepRunnerMarketEntry } from './contract.js'
import type {
  DeepRunnerMarketOperationKind,
  DeepRunnerMarketOperationPreview,
  DeepRunnerMarketOperationState,
  DeepRunnerMarketOperationView,
} from './contract.js'
import { DeepRunnerMarketCatalogService } from './catalog.js'
import {
  createDeepRunnerMarketReceipt,
  defaultDeepRunnerRuntimeIdentity,
  marketReleaseCompatibility,
  removeDeepRunnerMarketReceipt,
  saveDeepRunnerMarketReceipt,
  setDeepRunnerPluginDisabled,
} from './compatibility.js'

const OUTPUT_LIMIT = 64 * 1024
const OPERATION_LIMIT = 32
const PREVIEW_LIMIT = 32
const PREVIEW_TTL_MS = 5 * 60 * 1000

interface PreviewRecord extends DeepRunnerMarketOperationPreview {
  readonly catalogVersion: string
  readonly sourceRevision: string
  readonly distIntegrity?: string
}

interface ReceiptSource {
  readonly sourceId: string
  readonly catalogVersion: string
  readonly sideloadSource?: { readonly kind: 'npm' | 'github'; readonly normalizedSource: string }
}

interface MutableOperation {
  readonly id: string
  readonly pluginId: string
  readonly kind: DeepRunnerMarketOperationKind
  readonly startedAt: string
  state: DeepRunnerMarketOperationState
  finishedAt?: string
  stdout: string
  stderr: string
  exitCode?: number | null
  error?: string
  handle: DeepRunnerProcessHandle | undefined
  cancelRequested: boolean
}

export interface DeepRunnerMarketOperationServiceOptions {
  readonly catalog: DeepRunnerMarketCatalogService
  readonly packages: DeepRunnerPackages
  readonly profiles: DeepRunnerProfiles
  readonly now?: () => Date
  readonly id?: () => string
  readonly runtime?: DeepRunnerRuntimeIdentity
}

function appendBounded(current: string, chunk: unknown): string {
  const next = current + String(chunk)
  return next.length <= OUTPUT_LIMIT ? next : next.slice(next.length - OUTPUT_LIMIT)
}

function publicView(operation: MutableOperation): DeepRunnerMarketOperationView {
  return {
    id: operation.id,
    pluginId: operation.pluginId,
    kind: operation.kind,
    state: operation.state,
    startedAt: operation.startedAt,
    ...(operation.finishedAt === undefined ? {} : { finishedAt: operation.finishedAt }),
    stdout: operation.stdout,
    stderr: operation.stderr,
    ...(operation.exitCode === undefined ? {} : { exitCode: operation.exitCode }),
    ...(operation.error === undefined ? {} : { error: operation.error }),
  }
}

/** Owns bounded Market operations while M4 owns the actual process tree. */
export class DeepRunnerMarketOperationService {
  private readonly catalog: DeepRunnerMarketCatalogService
  private readonly packages: DeepRunnerPackages
  private readonly profiles: DeepRunnerProfiles
  private readonly now: () => Date
  private readonly id: () => string
  private readonly runtime: DeepRunnerRuntimeIdentity
  private readonly operations = new Map<string, MutableOperation>()
  private readonly previews = new Map<string, PreviewRecord>()
  private activeId: string | undefined

  constructor(options: DeepRunnerMarketOperationServiceOptions) {
    this.catalog = options.catalog
    this.packages = options.packages
    this.profiles = options.profiles
    this.now = options.now ?? (() => new Date())
    this.id = options.id ?? randomUUID
    this.runtime = structuredClone(options.runtime ?? defaultDeepRunnerRuntimeIdentity())
  }

  start(pluginId: string, kind: DeepRunnerMarketOperationKind): DeepRunnerMarketOperationView {
    if (this.activeId !== undefined) throw new Error('A market operation is already running')
    const entry = this.catalog.entry(pluginId)
    this.assertStartable(entry, pluginId, kind)
    if (entry === undefined) throw new Error('Unknown market plugin')
    const operation: MutableOperation = {
      id: this.id(),
      pluginId,
      kind,
      state: 'running',
      startedAt: this.now().toISOString(),
      stdout: '',
      stderr: '',
      handle: undefined,
      cancelRequested: false,
    }
    this.prune()
    this.operations.set(operation.id, operation)
    this.activeId = operation.id
    void this.execute(operation, entry, {
      sourceId: this.catalog.catalog.sourceId,
      catalogVersion: this.catalog.catalog.catalogVersion,
      ...(entry.trustLevel === 'sideloaded' ? { sideloadSource: {
        kind: 'npm' as const, normalizedSource: entry.release.exactSpec ?? entry.packageName,
      } } : {}),
    })
    return publicView(operation)
  }

  startSideload(
    entry: DeepRunnerMarketEntry,
    source: { readonly kind: 'npm' | 'github'; readonly normalizedSource: string },
    update = false,
  ): DeepRunnerMarketOperationView {
    if (entry.trustLevel !== 'sideloaded') throw new Error('Manual install entry must be sideloaded')
    if (entry.status !== 'listed'
      || entry.release.exactSpec !== `${entry.packageName}@${entry.release.version}`
      || entry.release.distIntegrity === undefined
      || entry.release.buildScriptPackages?.length) {
      throw new Error('Manual install entry does not contain a safe exact artifact')
    }
    if (this.activeId !== undefined) throw new Error('A market operation is already running')
    const installed = this.profiles.list().find(item => item.name === this.profiles.current.name)
      ?.bundles.includes(entry.packageName) === true
    if (installed && !update) throw new Error('Plugin is already installed in this Profile')
    if (!installed && update) throw new Error('Plugin is not installed in this Profile')
    const compatibility = marketReleaseCompatibility(entry, this.runtime, process.platform, process.arch)
    if (!compatibility.compatible) throw new Error(compatibility.reason ?? 'Plugin is incompatible')
    const operation: MutableOperation = {
      id: this.id(), pluginId: entry.id, kind: update ? 'update' : 'install', state: 'running',
      startedAt: this.now().toISOString(), stdout: '', stderr: '', handle: undefined,
      cancelRequested: false,
    }
    this.prune()
    this.operations.set(operation.id, operation)
    this.activeId = operation.id
    void this.execute(operation, entry, {
      sourceId: `sideload:${source.kind}`, catalogVersion: 'manual', sideloadSource: source,
    })
    return publicView(operation)
  }

  preview(pluginId: string, kind: DeepRunnerMarketOperationKind): DeepRunnerMarketOperationPreview {
    const entry = this.catalog.entry(pluginId)
    this.assertStartable(entry, pluginId, kind)
    if (entry === undefined) throw new Error('Unknown market plugin')
    const now = this.now()
    for (const [token, preview] of this.previews) {
      if (Date.parse(preview.expiresAt) <= now.getTime()) this.previews.delete(token)
    }
    while (this.previews.size >= PREVIEW_LIMIT) {
      const oldest = this.previews.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.previews.delete(oldest)
    }
    const preview: PreviewRecord = {
      token: randomUUID(),
      pluginId,
      kind,
      packageName: entry.packageName,
      version: entry.release.version,
      profile: this.profiles.current.name,
      expiresAt: new Date(now.getTime() + PREVIEW_TTL_MS).toISOString(),
      ...((kind === 'install' || kind === 'update') && entry.release.buildScriptPackages?.length
        ? { warning: `This install permits reviewed build scripts for: ${entry.release.buildScriptPackages.join(', ')}` }
        : {}),
      catalogVersion: this.catalog.catalog.catalogVersion,
      sourceRevision: entry.release.sourceRevision,
      ...(entry.release.distIntegrity === undefined ? {} : { distIntegrity: entry.release.distIntegrity }),
    }
    this.previews.set(preview.token, preview)
    const { catalogVersion: _catalogVersion, sourceRevision: _sourceRevision, distIntegrity: _integrity, ...view } = preview
    return view
  }

  executePreview(token: string): DeepRunnerMarketOperationView {
    const preview = this.previews.get(token)
    this.previews.delete(token)
    if (preview === undefined || Date.parse(preview.expiresAt) <= this.now().getTime()) {
      throw new Error('Operation preview is missing or expired')
    }
    const entry = this.catalog.entry(preview.pluginId)
    if (entry === undefined
      || this.catalog.catalog.catalogVersion !== preview.catalogVersion
      || entry.packageName !== preview.packageName
      || entry.release.version !== preview.version
      || entry.release.sourceRevision !== preview.sourceRevision
      || entry.release.distIntegrity !== preview.distIntegrity
      || this.profiles.current.name !== preview.profile) {
      throw new Error('Market release or Profile changed after preview; review the operation again')
    }
    return this.start(preview.pluginId, preview.kind)
  }

  private assertStartable(
    entry: DeepRunnerMarketEntry | undefined,
    pluginId: string,
    kind: DeepRunnerMarketOperationKind,
  ): void {
    if (entry === undefined) throw new Error('Unknown market plugin')
    if (entry.trustLevel === 'builtin') throw new Error('Built-in components cannot be changed')
    const view = this.catalog.view().entries.find(candidate => candidate.id === pluginId)
    if (view === undefined) throw new Error('Unknown market plugin')
    if ((kind === 'remove' || kind === 'enable' || kind === 'disable' || kind === 'switch') && !view.installed) {
      throw new Error('Plugin is not installed')
    }
    if (kind === 'switch' && (!view.canSwitchToMarket || entry.trustLevel === 'sideloaded')) {
      throw new Error('This sideloaded plugin has no matching Market version')
    }
    if (kind === 'enable' && view.activationStatus === 'quarantined') {
      throw new Error(view.activationReason ?? 'Plugin is quarantined for compatibility')
    }
    if (kind === 'install' || kind === 'update' || kind === 'switch') {
      if (kind === 'install' && view.installed) {
        throw new Error('Plugin is already installed')
      }
      if ((kind === 'update' || kind === 'switch') && !view.installed) {
        throw new Error('Plugin is not installed')
      }
      if (kind === 'update' && (view.installedVersion === undefined
        || view.installedVersion === entry.release.version)) {
        throw new Error('No newer verified Market version is available; remove and reinstall the plugin instead')
      }
      if (entry.status !== 'listed') throw new Error(`Plugin is ${entry.status}`)
      if (view.revoked) throw new Error('Plugin release is revoked')
      if (!view.compatible) throw new Error(view.compatibilityReason ?? 'Plugin is incompatible')
      if (entry.release.exactSpec === undefined || entry.release.distIntegrity === undefined) {
        throw new Error('Plugin release is missing an exact artifact')
      }
    }
  }

  get(id: string): DeepRunnerMarketOperationView | undefined {
    const operation = this.operations.get(id)
    return operation === undefined ? undefined : publicView(operation)
  }

  cancel(id: string): DeepRunnerMarketOperationView | undefined {
    const operation = this.operations.get(id)
    if (operation === undefined) return undefined
    if (operation.state === 'running') {
      operation.cancelRequested = true
      operation.handle?.cancel()
    }
    return publicView(operation)
  }

  get busy(): boolean {
    return this.activeId !== undefined
  }

  private prune(): void {
    if (this.operations.size < OPERATION_LIMIT) return
    for (const [id, operation] of this.operations) {
      if (operation.state !== 'running') {
        this.operations.delete(id)
        if (this.operations.size < OPERATION_LIMIT) return
      }
    }
  }

  private async execute(
    operation: MutableOperation,
    entry: DeepRunnerMarketEntry,
    receiptSource: ReceiptSource,
  ): Promise<void> {
    try {
      if (operation.kind === 'enable' || operation.kind === 'disable') {
        setDeepRunnerPluginDisabled(
          this.profiles.current.dir,
          entry.packageName,
          operation.kind === 'disable',
        )
        operation.exitCode = 0
        operation.state = 'succeeded'
        return
      }
      if (operation.kind !== 'remove') await this.verifyIntegrity(operation, entry)
      if (operation.cancelRequested) throw new Error('Market operation cancelled')
      const args = operation.kind === 'remove'
        ? ['remove', entry.packageName]
        : ['add', entry.release.exactSpec as string]
      const result = await this.consume(
        operation,
        this.packages.runPlugin(args, this.profiles.current.dir),
        true,
      )
      operation.exitCode = result.outcome.exitCode
      if (operation.cancelRequested || result.outcome.signal !== null) {
        operation.state = 'cancelled'
      } else if (result.outcome.exitCode === 0) {
        if (operation.kind === 'remove') {
          removeDeepRunnerMarketReceipt(this.profiles.current.dir, entry.packageName)
          setDeepRunnerPluginDisabled(this.profiles.current.dir, entry.packageName, false)
        } else {
          const receipt = createDeepRunnerMarketReceipt(
            this.profiles.current.dir,
            this.profiles.current.name,
            entry,
            {
              sourceId: receiptSource.sourceId,
              catalogVersion: receiptSource.catalogVersion,
            },
            this.runtime,
            this.now().toISOString(),
            receiptSource.sideloadSource,
          )
          saveDeepRunnerMarketReceipt(this.profiles.current.dir, receipt)
        }
        operation.state = 'succeeded'
      } else {
        operation.state = 'failed'
        operation.error = `Plugin command exited with code ${String(result.outcome.exitCode)}`
      }
    } catch (cause) {
      operation.state = operation.cancelRequested ? 'cancelled' : 'failed'
      operation.error = cause instanceof Error ? cause.message : String(cause)
    } finally {
      operation.finishedAt = this.now().toISOString()
      operation.handle = undefined
      if (this.activeId === operation.id) this.activeId = undefined
    }
  }

  private async verifyIntegrity(
    operation: MutableOperation,
    entry: DeepRunnerMarketEntry,
  ): Promise<void> {
    const exactSpec = entry.release.exactSpec
    const expected = entry.release.distIntegrity
    if (exactSpec === undefined || expected === undefined) {
      throw new Error('Plugin release is missing an exact artifact')
    }
    const result = await this.consume(
      operation,
      this.packages.runPnpm(['view', exactSpec, 'dist.integrity', '--json']),
      false,
    )
    if (operation.cancelRequested || result.outcome.signal !== null) {
      throw new Error('Market operation cancelled')
    }
    if (result.outcome.exitCode !== 0) {
      throw new Error(`Plugin integrity lookup exited with code ${String(result.outcome.exitCode)}`)
    }
    const text = result.stdout.trim()
    let actual: unknown
    try {
      actual = JSON.parse(text) as unknown
    } catch {
      actual = text
    }
    if (actual !== expected) throw new Error('Plugin artifact integrity does not match the market catalog')
    this.packages.allowBuildScripts(entry.release.buildScriptPackages ?? [])
  }

  private async consume(
    operation: MutableOperation,
    handle: DeepRunnerProcessHandle,
    publishStdout: boolean,
  ): Promise<{
    readonly outcome: DeepRunnerProcessOutcome
    readonly stdout: string
  }> {
    operation.handle = handle
    if (operation.cancelRequested) handle.cancel()
    let stdout = ''
    handle.stdout.setEncoding('utf8')
    handle.stderr.setEncoding('utf8')
    handle.stdout.on('data', (chunk) => {
      stdout = appendBounded(stdout, chunk)
      if (publishStdout) operation.stdout = appendBounded(operation.stdout, chunk)
    })
    handle.stderr.on('data', chunk => { operation.stderr = appendBounded(operation.stderr, chunk) })
    const stdoutFinished = finished(handle.stdout)
    const stderrFinished = finished(handle.stderr)
    const outcome = await handle.done
    await Promise.all([stdoutFinished, stderrFinished])
    operation.handle = undefined
    return { outcome, stdout }
  }
}
