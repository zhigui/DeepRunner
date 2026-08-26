import {
  DEEPRUNNER_MARKET_CATALOG_PATH,
  DEEPRUNNER_MARKET_OPERATIONS_PATH,
  DEEPRUNNER_MARKET_PREVIEW_PATH,
  DEEPRUNNER_MARKET_RESTART_PATH,
  DEEPRUNNER_MARKET_MANUAL_INSTALL_PATH,
  DEEPRUNNER_MARKET_MANUAL_CHECK_PATH,
  DEEPRUNNER_MARKET_MANUAL_RESOLVE_PATH,
  type DeepRunnerMarketCatalogEntryView,
  type DeepRunnerMarketCatalogView,
  type DeepRunnerMarketOperationKind,
  type DeepRunnerMarketOperationPreview,
  type DeepRunnerMarketOperationView,
  type DeepRunnerMarketTrustLevel,
  type DeepRunnerMarketManualResolveView,
} from '../contract.js'

export type MarketFilter = 'all' | DeepRunnerMarketTrustLevel
export type MarketTab = 'discover' | 'installed' | 'updates'

export interface MarketState {
  readonly catalog?: DeepRunnerMarketCatalogView | undefined
  readonly loading: boolean
  readonly error?: string | undefined
  readonly query: string
  readonly tab: MarketTab
  readonly filter: MarketFilter
  readonly selectedId?: string | undefined
  readonly operation?: DeepRunnerMarketOperationView | undefined
  readonly pending?: {
    readonly pluginId: string
    readonly kind: DeepRunnerMarketOperationKind
    readonly preview?: DeepRunnerMarketOperationPreview | undefined
  } | undefined
  readonly restartRequired: boolean
  readonly restartRequirements: Readonly<Record<string, string>>
  readonly restartPromptOpen: boolean
  readonly restarting: boolean
  readonly detailsOpen: boolean
  readonly manualDetail?: DeepRunnerMarketManualResolveView | undefined
  readonly manual: {
    readonly mode: 'install' | 'update'
    readonly open: boolean
    readonly input: string
    readonly resolving: boolean
    readonly installing: boolean
    readonly preview?: DeepRunnerMarketManualResolveView | undefined
  }
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  const value = await response.json() as unknown
  if (!response.ok) {
    const message = value !== null && typeof value === 'object'
      && typeof (value as { message?: unknown }).message === 'string'
      ? (value as { message: string }).message
      : `Request failed (${String(response.status)})`
    throw new Error(message)
  }
  return value as T
}

/**
 * Shared market UI state. The browser lives in the center column while the
 * selected plugin's detail renders in the details column; both subscribe to
 * this one observable snapshot so selection and operations stay in sync.
 */
export class MarketStore {
  private state: MarketState = {
    loading: false,
    query: '',
    tab: 'discover',
    filter: 'all',
    restartRequired: false,
    restartRequirements: {},
    restartPromptOpen: false,
    restarting: false,
    detailsOpen: true,
    manual: { mode: 'install', open: false, input: '', resolving: false, installing: false },
  }
  private readonly listeners = new Set<() => void>()

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  readonly snapshot = (): MarketState => this.state

  setQuery(query: string): void {
    this.patch({ query })
  }

  setTab(tab: MarketTab): void {
    this.patch({
      tab,
      query: '',
      error: undefined,
      ...(tab === 'discover' && this.state.filter === 'sideloaded' ? { filter: 'all' as const } : {}),
    })
  }

  setFilter(filter: MarketFilter): void {
    this.patch({ filter })
  }

  select(selectedId: string | undefined): void {
    this.patch({ selectedId, error: undefined, detailsOpen: true })
  }

  /** Collapse the detail panel; picking a plugin row opens it again. */
  closeDetail(): void {
    this.patch({ detailsOpen: false })
  }

  /** Re-show the detail panel (each market open starts with it visible). */
  openDetailPanel(): void {
    if (this.state.detailsOpen) return
    this.patch({ detailsOpen: true })
  }

  openManualInstall(): void {
    this.patch({
      error: undefined,
      manual: { mode: 'install', open: true, input: '', resolving: false, installing: false },
    })
  }

  retryManualSource(): void {
    const detail = this.state.manualDetail
    if (detail === undefined || this.state.operation?.state === 'running') return
    this.patch({
      error: undefined,
      manual: {
        mode: 'install', open: true, input: detail.normalizedSource,
        resolving: false, installing: false,
      },
    })
  }

  closeManualInstall(): void {
    if (this.state.manual.resolving || this.state.manual.installing) return
    this.patch({
      error: undefined,
      manual: { mode: 'install', open: false, input: '', resolving: false, installing: false },
    })
  }

  setManualInput(input: string): void {
    this.patch({
      error: undefined,
      manual: { ...this.state.manual, input, preview: undefined },
    })
  }

  resolveManualSource(): Promise<void> {
    const source = this.state.manual.input.trim()
    if (source.length === 0 || this.state.manual.resolving) return Promise.resolve()
    this.patch({ error: undefined, manual: { ...this.state.manual, resolving: true, preview: undefined } })
    return jsonRequest<DeepRunnerMarketManualResolveView>(DEEPRUNNER_MARKET_MANUAL_RESOLVE_PATH, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source }),
    }).then((preview) => {
      this.patch({ manual: { ...this.state.manual, resolving: false, preview } })
    }).catch((cause: unknown) => {
      this.patch({
        error: cause instanceof Error ? cause.message : String(cause),
        manual: { ...this.state.manual, resolving: false, preview: undefined },
      })
    })
  }

  checkSideloadUpdates(entry: DeepRunnerMarketCatalogEntryView): Promise<void> {
    if (!entry.canCheckSideloadUpdates || this.state.manual.resolving) return Promise.resolve()
    this.patch({
      error: undefined,
      manual: { mode: 'update', open: true, input: '', resolving: true, installing: false },
    })
    return jsonRequest<DeepRunnerMarketManualResolveView>(DEEPRUNNER_MARKET_MANUAL_CHECK_PATH, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pluginId: entry.packageName }),
    }).then((preview) => {
      this.patch({ manual: { ...this.state.manual, resolving: false, preview } })
    }).catch((cause: unknown) => {
      this.patch({
        error: cause instanceof Error ? cause.message : String(cause),
        manual: { ...this.state.manual, resolving: false },
      })
    })
  }

  installManualSource(): Promise<void> {
    const preview = this.state.manual.preview
    if (preview === undefined || this.state.manual.installing) return Promise.resolve()
    this.patch({ error: undefined, manual: { ...this.state.manual, installing: true } })
    return jsonRequest<DeepRunnerMarketOperationView>(DEEPRUNNER_MARKET_MANUAL_INSTALL_PATH, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: preview.token }),
    }).then((operation) => {
      const transient = manualEntryView(preview)
      const catalog = this.state.catalog === undefined ? undefined : {
        ...this.state.catalog,
        entries: [
          ...this.state.catalog.entries.filter(entry => entry.id !== transient.id
            && entry.packageName !== transient.packageName),
          transient,
        ],
      }
      this.patch({
        selectedId: preview.installedVersion === undefined ? preview.entry.id : this.state.selectedId,
        operation,
        ...(preview.installedVersion === undefined ? {
          catalog,
          manualDetail: preview,
          detailsOpen: true,
          tab: 'discover' as const,
          filter: 'all' as const,
          query: '',
        } : {}),
        manual: { mode: 'install', open: false, input: '', resolving: false, installing: false },
      })
    }).catch((cause: unknown) => {
      this.patch({
        error: cause instanceof Error ? cause.message : String(cause),
        manual: { ...this.state.manual, installing: false },
      })
    })
  }

  loadCatalog(): Promise<void> {
    if (this.state.loading) return Promise.resolve()
    this.patch({ loading: true, error: undefined })
    return jsonRequest<DeepRunnerMarketCatalogView>(DEEPRUNNER_MARKET_CATALOG_PATH)
      .then((catalog) => {
        this.patch({
          catalog,
          loading: false,
          selectedId: this.state.selectedId ?? catalog.entries[0]?.id,
          ...(this.state.manualDetail !== undefined
            && catalog.entries.some(entry => entry.packageName === this.state.manualDetail?.entry.packageName
              && entry.installed)
            ? { manualDetail: undefined } : {}),
        })
      })
      .catch((cause: unknown) => {
        this.patch({ loading: false, error: cause instanceof Error ? cause.message : String(cause) })
      })
  }

  /** Poll a running operation once; reload the catalog after success. */
  refreshOperation(): Promise<void> {
    const { operation } = this.state
    if (operation === undefined || operation.state !== 'running') return Promise.resolve()
    return jsonRequest<DeepRunnerMarketOperationView>(
      `${DEEPRUNNER_MARKET_OPERATIONS_PATH}/${encodeURIComponent(operation.id)}`,
    )
      .then((value) => {
        this.patch({ operation: value })
        if (value.state === 'succeeded') {
          this.applyActivation(value)
          void this.loadCatalog()
        }
      })
      .catch((cause: unknown) => {
        this.patch({ error: cause instanceof Error ? cause.message : String(cause) })
      })
  }

  start(kind: DeepRunnerMarketOperationKind, entry?: DeepRunnerMarketCatalogEntryView): Promise<void> {
    const target = entry ?? this.selected()
    if (target === undefined || this.state.pending !== undefined || this.state.operation?.state === 'running') {
      return Promise.resolve()
    }
    this.patch({
      error: undefined,
      operation: undefined,
      pending: { pluginId: target.id, kind },
    })
    return jsonRequest<DeepRunnerMarketOperationPreview>(DEEPRUNNER_MARKET_PREVIEW_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pluginId: target.id, kind }),
    })
      .then((preview) => {
        if (kind === 'remove') {
          this.patch({ pending: { pluginId: target.id, kind, preview } })
          return
        }
        return this.executePreview(target.id, kind, preview)
      })
      .catch((cause: unknown) => {
        this.patch({
          pending: undefined,
          error: cause instanceof Error ? cause.message : String(cause),
        })
      })
  }

  /** Execute the server-issued removal preview after the user confirms it. */
  confirmStart(): Promise<void> {
    const { pending } = this.state
    if (pending?.preview === undefined) return Promise.resolve()
    return this.executePreview(pending.pluginId, pending.kind, pending.preview)
  }

  private executePreview(
    pluginId: string,
    kind: DeepRunnerMarketOperationKind,
    preview: DeepRunnerMarketOperationPreview,
  ): Promise<void> {
    this.patch({ pending: { pluginId, kind } })
    return jsonRequest<DeepRunnerMarketOperationView>(DEEPRUNNER_MARKET_OPERATIONS_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: preview.token }),
    })
      .then((value) => {
        this.patch({ selectedId: pluginId, pending: undefined, operation: value })
        if (value.state === 'succeeded') {
          this.applyActivation(value)
          void this.loadCatalog()
        }
      })
      .catch((cause: unknown) => {
        this.patch({
          pending: undefined,
          error: cause instanceof Error ? cause.message : String(cause),
        })
      })
  }

  dismissPreview(): void {
    if (this.state.pending?.preview === undefined) return
    this.patch({ pending: undefined })
  }

  deferRestart(): void {
    this.patch({ restartPromptOpen: false })
  }

  private applyActivation(operation: DeepRunnerMarketOperationView): void {
    const restartRequirements = { ...this.state.restartRequirements }
    if (operation.activation?.status === 'live') {
      delete restartRequirements[operation.pluginId]
      const restartRequired = Object.keys(restartRequirements).length > 0
      this.patch({
        restartRequirements,
        restartRequired,
        ...(!restartRequired ? { restartPromptOpen: false } : {}),
      })
      return
    }
    restartRequirements[operation.pluginId] = operation.activation?.reason
      ?? 'Restart DeepRunner to apply this plugin change.'
    this.patch({ restartRequirements, restartRequired: true, restartPromptOpen: true })
  }

  cancelOperation(): Promise<void> {
    const { operation } = this.state
    if (operation === undefined) return Promise.resolve()
    return jsonRequest<DeepRunnerMarketOperationView>(
      `${DEEPRUNNER_MARKET_OPERATIONS_PATH}/${encodeURIComponent(operation.id)}`,
      { method: 'DELETE' },
    )
      .then((value) => { this.patch({ operation: value }) })
      .catch((cause: unknown) => {
        this.patch({ error: cause instanceof Error ? cause.message : String(cause) })
      })
  }

  restart(): Promise<void> {
    if (this.state.restarting) return Promise.resolve()
    this.patch({ restarting: true, error: undefined })
    return jsonRequest(DEEPRUNNER_MARKET_RESTART_PATH, { method: 'POST' })
      .then(() => {})
      .catch((cause: unknown) => {
        this.patch({
          restarting: false,
          error: cause instanceof Error ? cause.message : String(cause),
        })
      })
  }

  private patch(partial: Partial<MarketState>): void {
    this.state = { ...this.state, ...partial }
    for (const listener of this.listeners) listener()
  }

  private selected(): DeepRunnerMarketCatalogEntryView | undefined {
    const { catalog, selectedId } = this.state
    if (selectedId === undefined) return undefined
    return catalog?.entries.find(entry => entry.id === selectedId)
  }
}

export const marketStore = new MarketStore()

function manualEntryView(preview: DeepRunnerMarketManualResolveView): DeepRunnerMarketCatalogEntryView {
  return {
    ...preview.entry,
    installed: false,
    compatible: true,
    activationStatus: 'not-installed',
    marketManaged: false,
    revoked: false,
    canCheckSideloadUpdates: false,
    canSwitchToMarket: false,
  }
}

export function hasUpdate(entry: DeepRunnerMarketCatalogEntryView): boolean {
  return entry.installationOrigin !== 'sideload-npm'
    && entry.installationOrigin !== 'sideload-github'
    && entry.installed && entry.installedVersion !== undefined
    && entry.installedVersion !== entry.release.version
}
