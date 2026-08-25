export const DEEPRUNNER_MARKET_PATH = '/__deeprunner/market'
export const DEEPRUNNER_MARKET_CATALOG_PATH = `${DEEPRUNNER_MARKET_PATH}/catalog`
export const DEEPRUNNER_MARKET_OPERATIONS_PATH = `${DEEPRUNNER_MARKET_PATH}/operations`
export const DEEPRUNNER_MARKET_PREVIEW_PATH = `${DEEPRUNNER_MARKET_PATH}/operations/preview`
export const DEEPRUNNER_MARKET_RESTART_PATH = `${DEEPRUNNER_MARKET_PATH}/restart`
export const DEEPRUNNER_MARKET_MANUAL_RESOLVE_PATH = `${DEEPRUNNER_MARKET_PATH}/manual/resolve`
export const DEEPRUNNER_MARKET_MANUAL_INSTALL_PATH = `${DEEPRUNNER_MARKET_PATH}/manual/install`
export const DEEPRUNNER_MARKET_MANUAL_CHECK_PATH = `${DEEPRUNNER_MARKET_PATH}/manual/check`

export type DeepRunnerMarketTrustLevel = 'builtin' | 'verified-publisher' | 'community' | 'sideloaded'
export type DeepRunnerMarketEntryStatus = 'listed' | 'paused' | 'deprecated'
export type DeepRunnerMarketOperationKind = 'install' | 'update' | 'switch' | 'remove' | 'enable' | 'disable'
export type DeepRunnerMarketOperationState = 'running' | 'succeeded' | 'failed' | 'cancelled'
export type DeepRunnerMarketCatalogSourceKind = 'remote' | 'cache' | 'embedded'
export type DeepRunnerMarketActivationStatus = 'not-installed' | 'active' | 'unverified' | 'disabled' | 'quarantined'

export interface DeepRunnerMarketCatalogSourceView {
  readonly kind: DeepRunnerMarketCatalogSourceKind
  readonly url?: string
  readonly checkedAt?: string
  readonly warning?: string
}

export interface DeepRunnerMarketRelease {
  readonly version: string
  readonly exactSpec?: string
  readonly distIntegrity?: string
  readonly sourceRevision: string
  readonly publishedAt: string
  readonly dshVersionRange: string
  readonly deepRunnerVersionRange?: string
  readonly platforms: readonly ('darwin' | 'win32' | 'linux')[]
  readonly architectures?: readonly string[]
  readonly faces: readonly ('host' | 'client')[]
  readonly capabilities: readonly string[]
  readonly buildScriptPackages?: readonly string[]
  readonly releaseNotes?: string
}

export interface DeepRunnerMarketEntry {
  readonly id: string
  readonly packageName: string
  readonly displayName: string
  readonly summary: string
  readonly description: string
  readonly publisher: string
  readonly trustLevel: DeepRunnerMarketTrustLevel
  readonly repository?: string
  readonly homepage?: string
  readonly license: string
  readonly tags: readonly string[]
  readonly status: DeepRunnerMarketEntryStatus
  readonly release: DeepRunnerMarketRelease
}

export interface DeepRunnerMarketCatalog {
  readonly schemaVersion: 1
  readonly catalogVersion: string
  readonly generatedAt: string
  readonly sourceId: string
  readonly sourceRevision: string
  readonly entries: readonly DeepRunnerMarketEntry[]
  readonly revocations?: readonly DeepRunnerMarketRevocation[]
}

export interface DeepRunnerMarketRevocation {
  readonly pluginId: string
  readonly version?: string
  readonly reason: string
  readonly action: 'block-install' | 'recommend-remove'
  readonly publishedAt: string
}

export interface DeepRunnerMarketCatalogEntryView extends DeepRunnerMarketEntry {
  readonly installed: boolean
  readonly installedVersion?: string
  readonly compatible: boolean
  readonly compatibilityReason?: string
  readonly activationStatus: DeepRunnerMarketActivationStatus
  readonly activationReason?: string
  readonly marketManaged: boolean
  readonly revoked: boolean
  readonly revocationReason?: string
  readonly installationOrigin?: 'market' | 'sideload-npm' | 'sideload-github'
  readonly canCheckSideloadUpdates: boolean
  readonly canSwitchToMarket: boolean
}

export interface DeepRunnerMarketCatalogView {
  readonly schemaVersion: 1
  readonly catalogVersion: string
  readonly generatedAt: string
  readonly sourceId: string
  readonly source: DeepRunnerMarketCatalogSourceView
  readonly profile: string
  readonly entries: readonly DeepRunnerMarketCatalogEntryView[]
}

export interface DeepRunnerMarketOperationView {
  readonly id: string
  readonly pluginId: string
  readonly kind: DeepRunnerMarketOperationKind
  readonly state: DeepRunnerMarketOperationState
  readonly startedAt: string
  readonly finishedAt?: string
  readonly stdout: string
  readonly stderr: string
  readonly exitCode?: number | null
  readonly error?: string
}

export interface DeepRunnerMarketOperationRequest {
  readonly pluginId: string
  readonly kind: DeepRunnerMarketOperationKind
}

export interface DeepRunnerMarketOperationPreview {
  readonly token: string
  readonly pluginId: string
  readonly kind: DeepRunnerMarketOperationKind
  readonly packageName: string
  readonly version: string
  readonly profile: string
  readonly expiresAt: string
  readonly warning?: string
}

export interface DeepRunnerMarketOperationExecuteRequest {
  readonly token: string
}

export interface DeepRunnerMarketManualResolveRequest {
  readonly source: string
}

export interface DeepRunnerMarketManualResolveView {
  readonly token: string
  readonly expiresAt: string
  readonly profile: string
  readonly sourceKind: 'npm' | 'github'
  readonly normalizedSource: string
  readonly entry: DeepRunnerMarketEntry
  readonly warning: string
  readonly installedVersion?: string
  readonly updateAvailable: boolean
}
