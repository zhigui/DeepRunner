import type { DeepRunnerRecoveryModel } from './profile-recovery.js'

export const DEEPRUNNER_RECOVERY_ORIGIN = 'deeprunner-recovery://action'

export type DeepRunnerRecoveryAction =
  | { readonly kind: 'restart' }
  | { readonly kind: 'safe-mode' }
  | { readonly kind: 'select'; readonly profile: string }
  | { readonly kind: 'quit' }

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** Parse only the fixed, navigation-based recovery command surface. */
export function parseDeepRunnerRecoveryAction(value: string): DeepRunnerRecoveryAction | undefined {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return undefined
  }
  if (url.protocol !== 'deeprunner-recovery:'
    || url.hostname !== 'action'
    || url.port !== ''
    || url.username !== ''
    || url.password !== ''
    || url.hash !== '') return undefined
  switch (url.pathname) {
    case '/restart': return url.search === '' ? { kind: 'restart' } : undefined
    case '/safe-mode': return url.search === '' ? { kind: 'safe-mode' } : undefined
    case '/quit': return url.search === '' ? { kind: 'quit' } : undefined
    case '/select': {
      const profiles = url.searchParams.getAll('profile')
      if ([...url.searchParams.keys()].some(key => key !== 'profile') || profiles.length !== 1) return undefined
      const profile = profiles[0]
      return profile === undefined || profile.length === 0 ? undefined : { kind: 'select', profile }
    }
    default: return undefined
  }
}

/** Render a script-free recovery document outside the failed DSH Host. */
export function deepRunnerRecoveryHtml(model: DeepRunnerRecoveryModel): string {
  const profiles = model.profiles.map(profile => {
    const reason = profile.selectable ? '' : `<small>${escapeHtml(profile.reason ?? 'Unavailable')}</small>`
    const action = profile.selectable
      ? `<a class="profile" href="${DEEPRUNNER_RECOVERY_ORIGIN}/select?profile=${encodeURIComponent(profile.name)}">${escapeHtml(profile.name)}</a>`
      : `<span class="profile disabled">${escapeHtml(profile.name)}</span>`
    return `<li>${action}${reason}</li>`
  }).join('')
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DeepRunner Recovery</title>
  <style>
    :root{color-scheme:light dark;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f4f5f7;color:#20242c}
    @media(prefers-color-scheme:dark){:root{background:#17191d;color:#f2f4f8}}
    body{margin:0;padding:42px}.card{max-width:680px;margin:auto;padding:32px;border:1px solid #d6d9df;border-radius:18px;background:color-mix(in srgb,Canvas 92%,transparent);box-shadow:0 20px 60px #0002}
    h1{margin:0 0 10px;font-size:26px}p{color:GrayText}.error{padding:14px;border-radius:10px;background:#d33a2218;color:#b42318;white-space:pre-wrap;overflow-wrap:anywhere}
    ul{display:grid;gap:8px;padding:0;list-style:none}.profile{display:block;padding:10px 12px;border:1px solid #c7cbd3;border-radius:9px;color:inherit;text-decoration:none}.profile:hover{background:#7771}.disabled{opacity:.5}small{display:block;margin:4px 10px;color:GrayText}
    .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}a.button{padding:10px 14px;border-radius:9px;background:#1668e3;color:white;text-decoration:none}a.secondary{background:#727780}code{font-family:ui-monospace,SFMono-Regular,monospace}
  </style>
</head>
<body><main class="card">
  <h1>DeepRunner could not start</h1>
  <p>Profile <code>${escapeHtml(model.failedProfile)}</code> failed. Choose another Profile, retry, or start once without user and third-party patches.</p>
  <div class="error">${escapeHtml(model.error)}</div>
  <h2>Profiles</h2><ul>${profiles}</ul>
  <div class="actions">
    <a class="button" href="${DEEPRUNNER_RECOVERY_ORIGIN}/safe-mode">Start Safe Mode</a>
    <a class="button secondary" href="${DEEPRUNNER_RECOVERY_ORIGIN}/restart">Retry</a>
    <a class="button secondary" href="${DEEPRUNNER_RECOVERY_ORIGIN}/quit">Quit</a>
  </div>
</main></body></html>`
}
