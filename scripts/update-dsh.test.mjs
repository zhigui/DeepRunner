import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  collectDshClosure,
  collectInstalledDshClosure,
  compareSemver,
  parseArgs,
  replaceRuntimeBaseline,
  selectLatestReleaseTag,
  synchronizeDesktopRuntime,
  unpublishedPackagesFromInstallError,
  updateWorkspaceManifest,
} from './update-dsh.mjs'

test('selects the newest official DSH release including prereleases', () => {
  const selected = selectLatestReleaseTag([
    { tag_name: 'v1.0.0', draft: false },
    { tag_name: 'dsh-v0.1.1-rc.1', draft: false },
    { tag_name: 'dsh-v0.1.1-rc.2', draft: false },
    { tag_name: 'dsh-v9.0.0', draft: true },
  ])
  assert.deepEqual(selected, { tag: 'dsh-v0.1.1-rc.2', version: '0.1.1-rc.2' })
  assert.ok(compareSemver('0.1.1', '0.1.1-rc.2') > 0)
})

test('parses safe execution options', () => {
  assert.deepEqual(parseArgs(['--version', '0.1.1-rc.2', '--dry-run', '--package']), {
    dryRun: true,
    package: true,
    skipCheck: false,
    version: '0.1.1-rc.2',
  })
  assert.throws(() => parseArgs(['--unknown']), /Unknown option/u)
})

test('collects required DSH dependencies and non-optional peers', async () => {
  const fixtures = {
    '@deepseek-ai/dsh': {
      dependencies: { '@deepseek-ai/dsh-base': '^0.2.0', commander: '^15.0.0' },
      peerDependencies: { '@deepseek-ai/dsh-authorization': '^0.2.0' },
      peerDependenciesMeta: {},
    },
    '@deepseek-ai/dsh-base': {
      optionalDependencies: { '@deepseek-ai/dsh-native': '^0.2.0' },
      peerDependencies: { '@deepseek-ai/dsh-optional': '^0.2.0' },
      peerDependenciesMeta: { '@deepseek-ai/dsh-optional': { optional: true } },
    },
    '@deepseek-ai/dsh-authorization': {},
    '@deepseek-ai/dsh-native': {},
  }
  const result = await collectDshClosure(['@deepseek-ai/dsh'], '0.2.0', async name => fixtures[name])
  assert.deepEqual([...result.packages].sort(), [
    '@deepseek-ai/dsh',
    '@deepseek-ai/dsh-authorization',
    '@deepseek-ai/dsh-base',
    '@deepseek-ai/dsh-native',
  ])
  assert.equal(result.missing.size, 0)
})

test('discovers missing peers from installed manifests without registry traversal', async () => {
  const fixtures = {
    '@deepseek-ai/dsh': {
      version: '0.2.0',
      dependencies: { '@deepseek-ai/dsh-base': '^0.2.0' },
      peerDependencies: { '@deepseek-ai/dsh-new-peer': '^0.2.0' },
    },
    '@deepseek-ai/dsh-base': { version: '0.2.0' },
  }
  const result = await collectInstalledDshClosure(
    ['@deepseek-ai/dsh'],
    '0.2.0',
    async name => fixtures[name],
  )
  assert.deepEqual([...result.packages].sort(), ['@deepseek-ai/dsh', '@deepseek-ai/dsh-base'])
  assert.deepEqual([...result.missing], ['@deepseek-ai/dsh-new-peer'])
})

test('updates published workspace packages and removes unpublished packages', async () => {
  const update = await updateWorkspaceManifest({
    dependencies: {
      '@deepseek-ai/dsh': '0.1.0-rc.6',
      '@deepseek-ai/dsh-removed': '0.1.0-rc.6',
      react: '18.3.1',
    },
    peerDependencies: { '@deepseek-ai/dsh-agent': '^0.1.0-rc.6' },
  }, '0.1.1-rc.2', async name => name.endsWith('-removed') ? undefined : {})
  assert.deepEqual(update.manifest.dependencies, {
    '@deepseek-ai/dsh': '0.1.1-rc.2',
    react: '18.3.1',
  })
  assert.equal(update.manifest.peerDependencies['@deepseek-ai/dsh-agent'], '^0.1.1-rc.2')
  assert.deepEqual(update.removed, ['@deepseek-ai/dsh-removed'])
})

test('synchronizes the desktop runtime closure without touching other dependencies', () => {
  const result = synchronizeDesktopRuntime({
    dependencies: {
      '@deepseek-ai/dsh-old': '0.1.0',
      electron: '43.4.0',
    },
  }, new Set(['@deepseek-ai/dsh', '@deepseek-ai/dsh-new']), '0.1.1-rc.2')
  assert.deepEqual(result.dependencies, {
    '@deepseek-ai/dsh': '0.1.1-rc.2',
    '@deepseek-ai/dsh-new': '0.1.1-rc.2',
    electron: '43.4.0',
  })
})

test('updates only the declared runtime baseline', () => {
  const input = [
    "export const DEEPRUNNER_DSH_RUNTIME_VERSION = '0.1.0-rc.6'",
    "const thirdPartyRange = '^0.1.0-rc.6'",
    "const releaseNotes = 'Verified with DSH 0.1.0-rc.6'",
  ].join('\n')
  const result = replaceRuntimeBaseline(input, '0.1.0-rc.6', '0.1.1-rc.2')
  assert.equal(result, [
    "export const DEEPRUNNER_DSH_RUNTIME_VERSION = '0.1.1-rc.2'",
    "const thirdPartyRange = '^0.1.0-rc.6'",
    "const releaseNotes = 'Verified with DSH 0.1.0-rc.6'",
  ].join('\n'))
  assert.throws(
    () => replaceRuntimeBaseline(input, '0.1.0-rc.5', '0.1.1-rc.2'),
    /runtime baseline is 0\.1\.0-rc\.6, expected 0\.1\.0-rc\.5/u,
  )
})

test('extracts unpublished DSH packages from Yarn resolution failures', () => {
  const packages = unpublishedPackagesFromInstallError([
    'YN0082: @deepseek-ai/dsh-client-old@npm:0.2.0: No candidates found',
    'YN0082: @deepseek-ai/dsh-other@npm:0.2.0: No candidates found',
  ].join('\n'))
  assert.deepEqual([...packages], ['@deepseek-ai/dsh-client-old', '@deepseek-ai/dsh-other'])
})
