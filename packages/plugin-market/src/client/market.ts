import React, { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { hasUpdate, marketStore, type MarketState } from './store.js'
import type {
  DeepRunnerMarketCatalogEntryView,
  DeepRunnerMarketCatalogView,
  DeepRunnerMarketOperationView,
  DeepRunnerMarketTrustLevel,
} from '../contract.js'

const h = React.createElement

class MarketVisibility {
  private openValue = false
  private readonly listeners = new Set<() => void>()

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  readonly snapshot = (): boolean => this.openValue

  set(open: boolean): void {
    if (open === this.openValue) return
    this.openValue = open
    for (const listener of this.listeners) listener()
  }
}

/** Shared open state of the main-area market view (button <-> shell wiring). */
export const marketVisibility = new MarketVisibility()

function marketIcon(): React.ReactElement {
  return h('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
    h('path', {
      d: 'M20 13.5V19a1 1 0 0 1-1 1h-5.5v-1.5a2.5 2.5 0 0 0-5 0V20H5a1 1 0 0 1-1-1v-5.5h1.5a2.5 2.5 0 0 0 0-5H4V5a1 1 0 0 1 1-1h3.5v1.5a2.5 2.5 0 0 0 5 0V4H19a1 1 0 0 1 1 1v3.5h-1.5a2.5 2.5 0 0 0 0 5H20Z',
      stroke: 'currentColor',
      strokeWidth: 1.7,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }))
}

function searchIcon(): React.ReactElement {
  return h('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
    h('path', {
      d: 'm20 20-4.35-4.35M17 10.5A6.5 6.5 0 1 1 4 10.5a6.5 6.5 0 0 1 13 0Z',
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
    }))
}

function refreshIcon(): React.ReactElement {
  return h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
    h('path', {
      d: 'M20 6v5h-5M4 18v-5h5M18.2 9A7 7 0 0 0 6.7 6.7L4 9m16 6-2.7 2.3A7 7 0 0 1 5.8 15',
      stroke: 'currentColor',
      strokeWidth: 1.8,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }))
}

function closeIcon(): React.ReactElement {
  return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    h('path', { d: 'M14.1168 13.197 13.197 14.1167 1.8833 2.80303 2.80309 1.88324 14.1168 13.197Z', fill: 'currentColor' }),
    h('path', { d: 'M13.197 1.88326 14.1168 2.80305 2.80309 14.1168 1.8833 13.197 13.197 1.88326Z', fill: 'currentColor' }))
}

export function DeepRunnerMarketButton(props: SidebarFooterActionOwnerProps): React.ReactElement {
  const open = useSyncExternalStore(marketVisibility.subscribe, marketVisibility.snapshot)
  return h('button', {
    type: 'button',
    className: 'deeprunner-market-trigger',
    'data-wide': String(props.wide),
    'data-active': String(open),
    'aria-label': 'Open plugin market',
    'aria-expanded': open,
    title: 'Plugin market',
    onClick: () => { marketVisibility.set(true) },
  }, marketIcon(), props.wide ? h('span', null, 'Plugins') : null)
}

function trustLabel(trust: DeepRunnerMarketTrustLevel): string {
  if (trust === 'builtin') return 'DeepRunner built-in'
  if (trust === 'verified-publisher') return 'Verified publisher'
  if (trust === 'sideloaded') return 'Sideloaded · Unverified'
  return 'Curated community'
}

function sourceLabel(catalog: DeepRunnerMarketCatalogView): string {
  if (catalog.source.kind === 'remote') return 'Live catalog'
  if (catalog.source.kind === 'cache') return 'Cached catalog'
  return 'Built-in fallback'
}

function entryInitial(entry: { readonly displayName: string }): string {
  return entry.displayName.trim().slice(0, 1).toUpperCase() || 'P'
}

function badge(entry: DeepRunnerMarketCatalogEntryView): React.ReactElement {
  const sideloaded = entry.installationOrigin === 'sideload-npm'
    || entry.installationOrigin === 'sideload-github'
  return h('span', {
    className: 'deeprunner-market-badge',
    'data-trust': sideloaded ? 'sideloaded' : entry.trustLevel,
  }, sideloaded ? 'Sideloaded' : trustLabel(entry.trustLevel))
}

function verifiedMark(entry: DeepRunnerMarketCatalogEntryView): React.ReactElement | null {
  if (entry.installationOrigin === 'sideload-npm' || entry.installationOrigin === 'sideload-github') return null
  if (entry.trustLevel !== 'verified-publisher' && entry.trustLevel !== 'builtin') return null
  return h('span', {
    className: 'deeprunner-market-verified',
    title: entry.trustLevel === 'builtin' ? 'DeepRunner built-in' : 'Verified publisher',
  }, h('svg', { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
    h('path', {
      d: 'M12 2.6 14.9 4l3.2-.3 1 3 2.4 2.2-1.3 3 0 .1 1.3 3-2.4 2.2-1 3-3.2-.3L12 21.4 9.1 20l-3.2.3-1-3L2.5 15l1.3-3v-.1l-1.3-3 2.4-2.2 1-3 3.2.3L12 2.6Z',
      fill: 'currentColor',
      opacity: .18,
    }),
    h('path', {
      d: 'm8.6 12.2 2.3 2.3 4.5-4.8',
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    })))
}

type Tab = 'discover' | 'installed' | 'updates'

const TABS: Array<[Tab, string]> = [
  ['discover', 'Discover'],
  ['installed', 'Installed'],
  ['updates', 'Updates'],
]

const FILTERS: Array<['all' | DeepRunnerMarketTrustLevel, string]> = [
  ['all', 'All'],
  ['builtin', 'Built-in'],
  ['verified-publisher', 'Official'],
  ['community', 'Community'],
  ['sideloaded', 'Sideloaded'],
]

function emptyText(tab: Tab): string {
  if (tab === 'installed') return 'No plugins installed in this profile yet.'
  if (tab === 'updates') return 'Every installed plugin is up to date.'
  return 'No plugins match this view.'
}

function rowStatus(entry: DeepRunnerMarketCatalogEntryView): string | undefined {
  if (entry.revoked) return 'Revoked'
  if (!entry.compatible) return 'Incompatible'
  if (!entry.installed) return undefined
  if (entry.activationStatus === 'quarantined') return 'Compatibility blocked'
  if (entry.activationStatus === 'disabled') return 'Disabled'
  if (entry.installationOrigin === 'sideload-npm' || entry.installationOrigin === 'sideload-github') {
    return 'Installed outside DeepRunner Market'
  }
  if (hasUpdate(entry)) return undefined
  return `Installed${entry.installedVersion === undefined ? '' : ` · ${entry.installedVersion}`}`
}

function loadingRing(): React.ReactElement {
  return h('span', { className: 'deeprunner-market-loading-ring', 'aria-hidden': 'true' })
}

function actionLabel(kind: DeepRunnerMarketOperationView['kind']): string {
  if (kind === 'install') return 'Install'
  if (kind === 'update') return 'Update'
  if (kind === 'switch') return 'Switch'
  if (kind === 'remove') return 'Remove'
  if (kind === 'enable') return 'Enable'
  return 'Disable'
}

function runningLabel(kind: DeepRunnerMarketOperationView['kind']): string {
  if (kind === 'install') return 'Installing…'
  if (kind === 'update') return 'Updating…'
  if (kind === 'switch') return 'Switching…'
  if (kind === 'remove') return 'Removing…'
  if (kind === 'enable') return 'Enabling…'
  return 'Disabling…'
}

function detailActionContent(
  state: MarketState,
  pluginId: string,
  kind: DeepRunnerMarketOperationView['kind'],
  idleLabel: string,
): React.ReactNode {
  const pending = state.pending?.pluginId === pluginId && state.pending.kind === kind
    ? state.pending
    : undefined
  if (pending !== undefined) {
    return h(React.Fragment, null,
      pending.preview === undefined ? loadingRing() : null,
      pending.preview === undefined ? 'Preparing…' : 'Awaiting confirmation')
  }
  if (state.operation?.pluginId === pluginId
    && state.operation.kind === kind
    && state.operation.state === 'running') {
    return h(React.Fragment, null, loadingRing(), runningLabel(kind))
  }
  return idleLabel
}

function row(entry: DeepRunnerMarketCatalogEntryView, selected: boolean, state: MarketState): React.ReactElement {
  const quickInstall = entry.trustLevel !== 'sideloaded'
    && !entry.installed && entry.compatible && entry.status === 'listed' && !entry.revoked
  const quickUpdate = hasUpdate(entry)
    && entry.compatible && entry.status === 'listed' && !entry.revoked
    && entry.activationStatus !== 'quarantined'
  const activeKind = state.pending?.pluginId === entry.id
    ? state.pending.kind
    : state.operation?.pluginId === entry.id && state.operation.state === 'running'
      ? state.operation.kind
      : undefined
  const busy = state.pending !== undefined || state.operation?.state === 'running'
  const activeLabel = state.pending?.pluginId === entry.id
    ? state.pending.preview === undefined ? 'Preparing…' : 'Awaiting confirmation'
    : activeKind === undefined ? undefined : runningLabel(activeKind)
  return h('div', {
    key: entry.id,
    className: 'deeprunner-market-row',
    'data-selected': String(selected),
    onClick: () => { marketStore.select(entry.id) },
  },
  h('div', { className: 'deeprunner-market-icon' }, entryInitial(entry)),
  h('div', { className: 'deeprunner-market-row-body' },
    h('div', { className: 'deeprunner-market-row-head' },
      h('h2', null, entry.displayName),
      verifiedMark(entry)),
    h('div', { className: 'deeprunner-market-row-publisher' }, entry.publisher),
    h('p', { className: 'deeprunner-market-row-summary' }, entry.summary)),
  h('div', { className: 'deeprunner-market-row-side' },
    activeLabel !== undefined
      ? h('button', {
        type: 'button',
        className: 'deeprunner-market-mini is-loading',
        disabled: true,
      }, state.pending?.preview === undefined ? loadingRing() : null, activeLabel)
      : quickInstall
      ? h('button', {
        type: 'button',
        className: 'deeprunner-market-mini',
        disabled: busy,
        onClick: (event: React.MouseEvent) => {
          event.stopPropagation()
          void marketStore.start('install', entry)
        },
      }, 'Install')
      : quickUpdate
        ? h('button', {
          type: 'button',
          className: 'deeprunner-market-mini secondary',
          disabled: busy,
          onClick: (event: React.MouseEvent) => {
            event.stopPropagation()
            void marketStore.start('update', entry)
          },
        }, 'Update')
        : rowStatus(entry) === undefined ? null : h('span', {
          className: 'deeprunner-market-row-status',
          'data-tone': entry.activationStatus === 'disabled'
            || entry.activationStatus === 'quarantined'
            || entry.revoked
            || !entry.compatible ? 'warn' : 'ok',
        }, rowStatus(entry))))
}

function operationLabel(operation: DeepRunnerMarketOperationView): string {
  const label = actionLabel(operation.kind)
  if (operation.state === 'running') return `${label} in progress…`
  if (operation.state === 'succeeded') return `${label} completed`
  if (operation.state === 'cancelled') return `${label} cancelled`
  return `${label} failed`
}

function operationOutput(state: MarketState, pluginId: string): React.ReactElement | null {
  const operation = state.operation
  if (operation === undefined || operation.pluginId !== pluginId) return null
  return h('details', { className: 'deeprunner-market-operation' },
    h('summary', null,
      h('span', {
        className: 'deeprunner-market-operation-dot',
        'data-state': operation.state,
      }),
      h('strong', null, operationLabel(operation)),
      h('span', { className: 'deeprunner-market-operation-hint' }, 'Show details')),
    h('div', { className: 'deeprunner-market-operation-body' },
      operation.state === 'running'
        ? h('div', { className: 'deeprunner-market-actionbar' }, h('button', {
          type: 'button', className: 'deeprunner-market-action quiet',
          onClick: () => { void marketStore.cancelOperation() },
        }, 'Cancel operation'))
        : null,
      operation.error === undefined ? null : h('div', { className: 'deeprunner-market-error' }, operation.error),
      operation.stdout.length === 0 && operation.stderr.length === 0
        ? h('p', { className: 'deeprunner-market-no-output' }, 'No command output was produced.')
        : h('pre', { className: 'deeprunner-market-log' }, `${operation.stdout}${operation.stderr}`)))
}

/** The selected plugin's detail body, rendered inside the shell's details column. */
function detailBody(state: MarketState, selected?: DeepRunnerMarketCatalogEntryView): React.ReactElement {
  const busy = state.pending !== undefined || state.operation?.state === 'running'
  return h(React.Fragment, null,
    selected === undefined
      ? h('div', { className: 'deeprunner-market-detail-empty' }, 'Select a plugin to inspect its source and capabilities.')
      : h(React.Fragment, null,
        h('div', { className: 'deeprunner-market-detail-top' },
          h('div', { className: 'deeprunner-market-icon large' }, entryInitial(selected)),
          h('div', null,
            h('h2', null, selected.displayName),
            h('div', { className: 'deeprunner-market-publisher' }, selected.publisher),
            h('div', { className: 'deeprunner-market-detail-badges' }, badge(selected)))),
        h('section', { className: 'deeprunner-market-actions', 'aria-label': 'Plugin actions' },
          h('div', { className: 'deeprunner-market-actionbar' },
            selected.trustLevel === 'builtin'
              ? h('button', { type: 'button', className: 'deeprunner-market-action secondary', disabled: true }, 'System component')
              : !selected.installed
                ? h('button', {
                  type: 'button', className: 'deeprunner-market-action',
                  disabled: busy || !selected.compatible || selected.status !== 'listed' || selected.revoked
                    || (selected.trustLevel === 'sideloaded' && state.manualDetail?.entry.id !== selected.id),
                  onClick: () => { selected.trustLevel === 'sideloaded'
                    ? marketStore.retryManualSource() : void marketStore.start('install') },
                }, detailActionContent(
                  state,
                  selected.id,
                  'install',
                  selected.trustLevel === 'sideloaded' ? 'Inspect source again' : 'Install',
                ))
                : h(React.Fragment, null,
                  hasUpdate(selected)
                    ? h('button', {
                      type: 'button', className: 'deeprunner-market-action', disabled: busy,
                      onClick: () => { void marketStore.start('update') },
                    }, detailActionContent(state, selected.id, 'update', 'Update'))
                    : null,
                  selected.canCheckSideloadUpdates
                    ? h('button', {
                      type: 'button', className: 'deeprunner-market-action quiet',
                      disabled: busy || (state.manual.mode === 'update' && state.manual.resolving),
                      onClick: () => { void marketStore.checkSideloadUpdates(selected) },
                    }, state.manual.mode === 'update' && state.manual.resolving
                      ? h(React.Fragment, null, loadingRing(), 'Checking…')
                      : 'Check for updates')
                    : null,
                  selected.canSwitchToMarket
                    ? h('button', {
                      type: 'button', className: 'deeprunner-market-action',
                      disabled: busy || !selected.compatible || selected.revoked || selected.status !== 'listed',
                      onClick: () => { void marketStore.start('switch') },
                    }, detailActionContent(state, selected.id, 'switch', 'Switch to Market version'))
                    : null,
                  selected.activationStatus === 'disabled'
                    ? h('button', {
                      type: 'button', className: 'deeprunner-market-action', disabled: busy,
                      onClick: () => { void marketStore.start('enable') },
                    }, detailActionContent(state, selected.id, 'enable', 'Enable'))
                    : selected.activationStatus === 'quarantined'
                      ? null
                      : h('button', {
                        type: 'button', className: 'deeprunner-market-action secondary', disabled: busy,
                        onClick: () => { void marketStore.start('disable') },
                      }, detailActionContent(state, selected.id, 'disable', 'Disable')),
                  h('button', {
                    type: 'button', className: 'deeprunner-market-action danger', disabled: busy,
                    onClick: () => { void marketStore.start('remove') },
                  }, detailActionContent(state, selected.id, 'remove', 'Remove'))),
            selected.repository === undefined ? null : h('a', {
              className: 'deeprunner-market-action quiet',
              href: selected.repository,
              target: '_blank',
              rel: 'noreferrer',
            }, 'View source')),
          operationOutput(state, selected.id),
          state.restartRequirements[selected.id] !== undefined
            ? h('div', { className: 'deeprunner-market-restart-callout', role: 'status' },
              h('div', { className: 'deeprunner-market-restart-copy' },
                h('strong', null, 'Restart required'),
                h('span', null, 'The plugin change is saved and will take effect after DeepRunner restarts.')),
              h('details', { className: 'deeprunner-market-restart-reason' },
                h('summary', null, 'Why is a restart needed?'),
                h('p', null, state.restartRequirements[selected.id])),
              h('button', {
                type: 'button',
                className: 'deeprunner-market-action restart',
                disabled: state.restarting || state.operation?.state === 'running',
                onClick: () => { void marketStore.restart() },
              }, state.restarting ? h(React.Fragment, null, loadingRing(), 'Restarting…') : 'Restart'))
            : null),
        state.error === undefined ? null : h('div', { className: 'deeprunner-market-error', role: 'alert' }, state.error),
        state.operation?.pluginId !== selected.id || state.operation.state !== 'failed'
          ? null
          : h('div', { className: 'deeprunner-market-error-card', role: 'alert' },
            h('strong', null, `${actionLabel(state.operation.kind)} failed`),
            h('span', null, state.operation.error ?? 'The plugin operation did not complete. Expand the operation output above for diagnostics.')),
        h('p', { className: 'deeprunner-market-description' }, selected.description),
        selected.installationOrigin === 'sideload-npm' || selected.installationOrigin === 'sideload-github'
          ? h('div', { className: 'deeprunner-market-warning' }, 'Installed outside DeepRunner Market. The package integrity was checked at install time, but this installation does not inherit a Market trust label.')
          : selected.trustLevel === 'community'
          ? h('div', { className: 'deeprunner-market-warning' }, 'Curated community listing: selected for this market, but the publisher is not marked as verified and DeepRunner does not claim a complete code audit.')
          : null,
        selected.revoked
          ? h('div', { className: 'deeprunner-market-warning' }, selected.revocationReason ?? 'This release has been revoked.')
          : selected.compatible ? null
            : h('div', { className: 'deeprunner-market-warning' }, selected.compatibilityReason ?? 'This plugin is incompatible.'),
        selected.activationReason === undefined
          ? null
          : h('div', { className: 'deeprunner-market-warning' }, selected.activationReason),
        h('dl', { className: 'deeprunner-market-meta' },
          h('div', null, h('dt', null, 'Version'), h('dd', null,
            selected.installationOrigin === 'sideload-npm' || selected.installationOrigin === 'sideload-github'
              ? selected.installedVersion ?? selected.release.version : selected.release.version)),
          h('div', null, h('dt', null, 'License'), h('dd', null, selected.license)),
          h('div', null, h('dt', null, 'Package'), h('dd', null, selected.packageName)),
          h('div', null, h('dt', null, 'Runs on'), h('dd', null, selected.release.faces.join(' + '))),
          selected.installationOrigin === 'sideload-npm' || selected.installationOrigin === 'sideload-github'
            ? h('div', null, h('dt', null, 'Installation'), h('dd', null, 'Installed outside DeepRunner Market'))
            : null,
          selected.canSwitchToMarket
            ? h('div', null, h('dt', null, 'Market version'), h('dd', null, selected.release.version))
            : null),
        h('div', { className: 'deeprunner-market-capabilities' }, selected.release.capabilities.map(capability => h('span', {
          key: capability,
          className: 'deeprunner-market-badge',
        }, capability))),
        selected.release.buildScriptPackages === undefined
          ? null
          : h('div', { className: 'deeprunner-market-warning' }, `Native build scripts allowed during install: ${selected.release.buildScriptPackages.join(', ')}`)))
}

/** The plugin detail panel rendered inside the market's own right column. */
function detailAside(state: MarketState, selected?: DeepRunnerMarketCatalogEntryView): React.ReactElement {
  return h('aside', { className: 'deeprunner-market-detail' },
    h('button', {
      type: 'button',
      className: 'deeprunner-market-detail-close',
      disabled: state.pending !== undefined || state.operation?.state === 'running',
      'aria-label': 'Close plugin details',
      title: 'Hide details',
      onClick: () => { marketStore.closeDetail() },
    }, closeIcon()),
    detailBody(state, selected))
}

function marketDialog(state: MarketState): React.ReactElement | null {
  const preview = state.pending?.preview
  if (preview !== undefined) {
    const label = actionLabel(preview.kind)
    return h('div', {
      className: 'deeprunner-market-dialog-backdrop',
      role: 'presentation',
      onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) marketStore.dismissPreview()
      },
    }, h('section', {
      className: 'deeprunner-market-dialog',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'deeprunner-market-confirm-title',
    },
    h('div', { className: 'deeprunner-market-dialog-eyebrow' }, 'Review change'),
    h('h2', { id: 'deeprunner-market-confirm-title' }, `${label} ${preview.packageName}`),
    h('p', null, `${preview.packageName}@${preview.version} will be changed in the “${preview.profile}” profile.`),
    preview.warning === undefined ? null : h('div', { className: 'deeprunner-market-dialog-warning' }, preview.warning),
    h('div', { className: 'deeprunner-market-dialog-actions' },
      h('button', {
        type: 'button',
        className: 'deeprunner-market-action quiet',
        onClick: () => { marketStore.dismissPreview() },
      }, 'Cancel'),
      h('button', {
        type: 'button',
        className: preview.kind === 'remove' ? 'deeprunner-market-action danger' : 'deeprunner-market-action',
        onClick: () => { void marketStore.confirmStart() },
      }, `${label} plugin`))))
  }

  if (state.manual.open) {
    const preview = state.manual.preview
    return h('div', {
      className: 'deeprunner-market-dialog-backdrop', role: 'presentation',
      onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) marketStore.closeManualInstall()
      },
    }, h('section', {
      className: 'deeprunner-market-dialog deeprunner-market-manual-dialog',
      role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'deeprunner-market-manual-title',
    },
    h('div', { className: 'deeprunner-market-dialog-eyebrow' }, 'Install from source'),
    h('h2', { id: 'deeprunner-market-manual-title' }, preview === undefined
      ? state.manual.mode === 'update' ? 'Checking NPM for updates…' : 'Inspect a third-party plugin'
      : preview.entry.displayName),
    preview === undefined
      ? state.manual.mode === 'update'
        ? h('div', { className: 'deeprunner-market-manual-loading' },
          state.manual.resolving ? loadingRing() : null,
          state.error ?? 'Resolving the latest published package metadata.')
        : h(React.Fragment, null,
        h('p', null, 'Enter an NPM package name, an NPM package page, or a public GitHub repository. GitHub links must point to a plugin that is already published on NPM.'),
        h('form', {
          className: 'deeprunner-market-manual-form',
          onSubmit: (event: React.FormEvent) => { event.preventDefault(); void marketStore.resolveManualSource() },
        },
        h('label', { htmlFor: 'deeprunner-market-manual-input' }, 'NPM package or GitHub URL'),
        h('input', {
          id: 'deeprunner-market-manual-input', autoFocus: true, value: state.manual.input,
          placeholder: '@scope/plugin or https://github.com/owner/repo',
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => { marketStore.setManualInput(event.currentTarget.value) },
        }),
        h('div', { className: 'deeprunner-market-manual-help' }, 'Only public HTTPS sources are accepted. Tarballs, private repositories, Git URLs and moving version ranges are not supported.'),
        state.error === undefined ? null : h('div', { className: 'deeprunner-market-error', role: 'alert' }, state.error),
        h('div', { className: 'deeprunner-market-dialog-actions' },
          h('button', { type: 'button', className: 'deeprunner-market-action quiet', onClick: () => { marketStore.closeManualInstall() } }, 'Cancel'),
          h('button', {
            type: 'submit', className: 'deeprunner-market-action',
            disabled: state.manual.resolving || state.manual.input.trim().length === 0,
          }, state.manual.resolving ? h(React.Fragment, null, loadingRing(), 'Inspecting…') : 'Inspect plugin'))))
      : h(React.Fragment, null,
        h('div', { className: 'deeprunner-market-manual-identity' },
          h('div', { className: 'deeprunner-market-icon' }, entryInitial(preview.entry)),
          h('div', null,
            h('strong', null, `${preview.entry.packageName}@${preview.entry.release.version}`),
            h('span', null, preview.entry.publisher))),
        h('p', { className: 'deeprunner-market-manual-description' }, preview.entry.description),
        h('div', { className: 'deeprunner-market-warning' }, preview.warning),
        preview.installedVersion === undefined ? null : h('div', {
          className: preview.updateAvailable ? 'deeprunner-market-update-result' : 'deeprunner-market-update-result is-current',
          role: 'status',
        }, preview.updateAvailable
          ? `Update available: ${preview.installedVersion} → ${preview.entry.release.version}`
          : `Up to date · ${preview.installedVersion}`),
        h('dl', { className: 'deeprunner-market-manual-meta' },
          h('div', null, h('dt', null, 'Source'), h('dd', null, preview.sourceKind === 'github' ? 'GitHub → NPM' : 'NPM')),
          h('div', null, h('dt', null, 'Profile'), h('dd', null, preview.profile)),
          h('div', null, h('dt', null, 'License'), h('dd', null, preview.entry.license)),
          h('div', null, h('dt', null, 'Runs on'), h('dd', null, preview.entry.release.faces.join(' + ')))),
        h('div', { className: 'deeprunner-market-capabilities' }, preview.entry.release.capabilities.map(capability => h('span', { key: capability, className: 'deeprunner-market-badge' }, capability))),
        state.error === undefined ? null : h('div', { className: 'deeprunner-market-error', role: 'alert' }, state.error),
        h('div', { className: 'deeprunner-market-dialog-actions' },
          h('button', {
            type: 'button', className: 'deeprunner-market-action quiet', disabled: state.manual.installing,
            onClick: () => { state.manual.mode === 'update'
              ? marketStore.closeManualInstall() : marketStore.setManualInput(state.manual.input) },
          }, state.manual.mode === 'update' ? 'Close' : 'Back'),
          h('button', {
            type: 'button', className: 'deeprunner-market-action',
            disabled: state.manual.installing || (preview.installedVersion !== undefined && !preview.updateAvailable),
            onClick: () => { void marketStore.installManualSource() },
          }, state.manual.installing
            ? h(React.Fragment, null, loadingRing(), preview.installedVersion === undefined ? 'Installing…' : 'Updating…')
            : preview.installedVersion === undefined ? 'Install unverified plugin' : 'Update sideloaded plugin')))))
  }

  if (!state.restartPromptOpen) return null
  return h('div', { className: 'deeprunner-market-dialog-backdrop', role: 'presentation' },
    h('section', {
      className: 'deeprunner-market-dialog',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'deeprunner-market-restart-title',
    },
    h('h2', { id: 'deeprunner-market-restart-title' }, 'Restart DeepRunner?'),
    h('p', null, 'The plugin change is saved. Restart now to apply it, or restart later without losing the installation.'),
    state.operation === undefined
      || state.restartRequirements[state.operation.pluginId] === undefined
      ? null
      : h('details', { className: 'deeprunner-market-dialog-reason' },
        h('summary', null, 'Why is a restart needed?'),
        h('p', null, state.restartRequirements[state.operation.pluginId])),
    h('div', { className: 'deeprunner-market-dialog-actions' },
      h('button', {
        type: 'button',
        className: 'deeprunner-market-action quiet',
        onClick: () => { marketStore.deferRestart() },
      }, 'Restart later'),
      h('button', {
        type: 'button',
        className: 'deeprunner-market-action',
        disabled: state.restarting,
        onClick: () => { void marketStore.restart() },
      }, state.restarting ? h(React.Fragment, null, loadingRing(), 'Restarting…') : 'Restart now'))))
}

/**
 * The market browser and selected plugin detail occupy one self-contained
 * center surface, independent of shell conversation details state.
 */
export function DeepRunnerMarketPage(_props: PropsRuntime<'conversation'>): React.ReactElement {
  const state = useSyncExternalStore(marketStore.subscribe, marketStore.snapshot)
  const searchInput = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    marketStore.openDetailPanel()
    void marketStore.loadCatalog()
  }, [])

  useEffect(() => {
    if (state.operation?.state !== 'running') return
    const timer = window.setTimeout(() => { void marketStore.refreshOperation() }, 500)
    return () => { window.clearTimeout(timer) }
  }, [state.operation])

  const entries = useMemo(() => (state.catalog?.entries ?? []).filter((entry) => {
    if (state.tab === 'discover' && entry.trustLevel === 'sideloaded' && entry.installed) return false
    if (state.tab === 'installed' && !entry.installed) return false
    if (state.tab === 'updates' && !hasUpdate(entry)) return false
    const displayedTrust = entry.installationOrigin === 'sideload-npm'
      || entry.installationOrigin === 'sideload-github' ? 'sideloaded' : entry.trustLevel
    if (state.filter !== 'all' && displayedTrust !== state.filter) return false
    const needle = state.query.trim().toLocaleLowerCase()
    if (needle.length === 0) return true
    return `${entry.displayName} ${entry.summary} ${entry.publisher} ${entry.tags.join(' ')}`
      .toLocaleLowerCase().includes(needle)
  }), [state.catalog, state.tab, state.filter, state.query])

  const selected = entries.find(entry => entry.id === state.selectedId) ?? entries[0]
  const busy = state.pending !== undefined || state.operation?.state === 'running'

  useEffect(() => {
    if (selected === undefined || selected.id === state.selectedId) return
    marketStore.select(selected.id)
  }, [selected])

  useEffect(() => {
    searchInput.current?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (state.pending?.preview !== undefined) marketStore.dismissPreview()
      else if (state.manual.open) marketStore.closeManualInstall()
      else if (state.restartPromptOpen) marketStore.deferRestart()
      else if (!busy) marketVisibility.set(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [busy, state.pending?.preview, state.restartPromptOpen, state.manual.open])

  return h('section', {
    className: 'deeprunner-market-page',
    role: 'region',
    'aria-label': 'Plugin market',
    'data-busy': String(busy),
    'data-details-open': String(state.detailsOpen),
  },
  h('div', { className: 'deeprunner-market-content' },
  h('header', { className: 'deeprunner-market-header' },
    h('div', { className: 'deeprunner-market-title' },
      h('h1', null, 'Plugins'),
      h('p', null, state.catalog === undefined
        ? 'Controlled catalog'
        : `${state.catalog.sourceId} · ${state.catalog.profile} · ${sourceLabel(state.catalog)}`)),
    h('div', { className: 'deeprunner-market-searchbox' },
      h('span', { className: 'deeprunner-market-search-icon', 'aria-hidden': 'true' }, searchIcon()),
      h('input', {
        ref: searchInput,
        className: 'deeprunner-market-search',
        value: state.query,
        placeholder: 'Search plugins, publishers and tags',
        'aria-label': 'Search plugins',
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => { marketStore.setQuery(event.currentTarget.value) },
      }))),
  h('nav', { className: 'deeprunner-market-tabs', 'aria-label': 'Plugin views' },
    TABS.map(([value, label]) => h('button', {
      key: value,
      type: 'button',
      className: 'deeprunner-market-tab',
      'aria-current': String(state.tab === value),
      onClick: () => { marketStore.setTab(value) },
    }, label))),
  h('div', { className: 'deeprunner-market-main' },
  h('div', { className: 'deeprunner-market-browser' },
    state.catalog?.source.warning === undefined ? null : h('div', {
      className: 'deeprunner-market-source-warning',
      role: 'status',
    }, `${sourceLabel(state.catalog)}: ${state.catalog.source.warning}`),
    h('div', { className: 'deeprunner-market-filterbar' },
      h('div', { className: 'deeprunner-market-filters' }, FILTERS
        .filter(([value]) => value !== 'sideloaded' || state.tab === 'installed')
        .map(([value, label]) => h('button', {
        key: value,
        type: 'button',
        className: 'deeprunner-market-chip',
        'aria-pressed': String(state.filter === value),
        onClick: () => { marketStore.setFilter(value) },
      }, label))),
      h('div', { className: 'deeprunner-market-filter-actions' },
        state.tab !== 'discover' ? null : h('button', {
          type: 'button', className: 'deeprunner-market-sideload', disabled: busy,
          onClick: () => { marketStore.openManualInstall() },
        }, h('span', { 'aria-hidden': 'true' }, '+'), 'Install from source…'),
        h('button', {
          type: 'button',
          className: 'deeprunner-market-refresh',
          disabled: state.loading || busy,
          'data-loading': String(state.loading),
          'aria-label': state.loading ? 'Refreshing plugin list' : 'Refresh plugin list',
          title: state.loading ? 'Refreshing plugins…' : 'Refresh plugins',
          onClick: () => { void marketStore.loadCatalog() },
        }, refreshIcon()))),
    state.loading ? h('div', { className: 'deeprunner-market-empty' }, 'Loading catalog…')
      : entries.length === 0 ? h('div', { className: 'deeprunner-market-empty' }, emptyText(state.tab))
        : h(React.Fragment, null,
          h('div', { className: 'deeprunner-market-list' }, entries.map(entry => row(
            entry,
            entry.id === selected?.id,
            state,
          ))),
          h('footer', { className: 'deeprunner-market-count' }, `${entries.length} ${entries.length === 1 ? 'plugin' : 'plugins'}`)))),
  marketDialog(state)),
  state.detailsOpen ? detailAside(state, selected) : null)
}
