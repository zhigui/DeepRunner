import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { access, lstat, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import test from 'node:test'

import { load } from 'js-yaml'

const root = resolve(import.meta.dirname, '..')
const cleanEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) => (
  !name.startsWith('DEEPRUNNER_') && name !== 'APPLE_API_KEY'
)))

const runScript = (script, environment = {}) => new Promise((resolveRun, rejectRun) => {
  const child = spawn(process.execPath, [resolve(root, script)], {
    cwd: root,
    env: { ...cleanEnvironment, ...environment },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk })
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
  child.on('error', rejectRun)
  child.on('close', code => resolveRun({ code, stderr, stdout }))
})

const withTemporaryDirectory = async callback => {
  const directory = await mkdtemp(resolve(tmpdir(), 'deeprunner-release-test-'))
  try {
    return await callback(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('prepares only a valid P-256 Apple key with private permissions', async () => {
  await withTemporaryDirectory(async directory => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const pem = privateKey.export({ format: 'pem', type: 'pkcs8' })
    const keyPath = resolve(directory, 'private', 'AuthKey.p8')
    const result = await runScript('scripts/prepare-apple-api-key.mjs', {
      APPLE_API_KEY: keyPath,
      DEEPRUNNER_APPLE_API_KEY_B64: Buffer.from(pem).toString('base64'),
    })

    assert.equal(result.code, 0, result.stderr)
    assert.equal(await readFile(keyPath, 'utf8'), pem)
    assert.equal((await lstat(keyPath)).mode & 0o777, 0o600)
    assert(!result.stdout.includes(keyPath), 'temporary key path must not be logged')
    assert(!result.stdout.includes('PRIVATE KEY'), 'private key material must not be logged')
  })
})

test('refuses to overwrite an existing Apple key path', async () => {
  await withTemporaryDirectory(async directory => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const pem = privateKey.export({ format: 'pem', type: 'pkcs8' })
    const keyPath = resolve(directory, 'AuthKey.p8')
    await writeFile(keyPath, 'sentinel', 'utf8')

    const result = await runScript('scripts/prepare-apple-api-key.mjs', {
      APPLE_API_KEY: keyPath,
      DEEPRUNNER_APPLE_API_KEY_B64: Buffer.from(pem).toString('base64'),
    })

    assert.notEqual(result.code, 0)
    assert.equal(await readFile(keyPath, 'utf8'), 'sentinel')
  })
})

test('merges macOS metadata and removes architecture intermediates', async () => {
  await withTemporaryDirectory(async directory => {
    for (const architecture of ['arm64', 'x64']) {
      await writeFile(resolve(directory, `latest-mac-${architecture}.yml`), [
        'version: 0.1.0',
        'files:',
        `  - url: DeepRunner-0.1.0-mac-${architecture}.zip`,
        `    sha512: ${architecture}`,
        '',
      ].join('\n'), 'utf8')
    }

    const result = await runScript('scripts/merge-mac-update-metadata.mjs', {
      DEEPRUNNER_RELEASE_ARTIFACTS_DIR: directory,
    })
    assert.equal(result.code, 0, result.stderr)

    const merged = load(await readFile(resolve(directory, 'latest-mac.yml'), 'utf8'))
    assert.equal(merged.files.length, 2)
    assert.equal('path' in merged, false)
    await assert.rejects(access(resolve(directory, 'latest-mac-arm64.yml')))
    await assert.rejects(access(resolve(directory, 'latest-mac-x64.yml')))
  })
})

test('release artifact allowlist rejects extra files and symbolic links', async () => {
  await withTemporaryDirectory(async directory => {
    const version = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version
    const names = [
      `DeepRunner-${version}-linux-amd64.deb`,
      `DeepRunner-${version}-linux-x86_64.AppImage`,
      `DeepRunner-${version}-mac-arm64.dmg`,
      `DeepRunner-${version}-mac-arm64.zip`,
      `DeepRunner-${version}-mac-arm64.zip.blockmap`,
      `DeepRunner-${version}-mac-x64.dmg`,
      `DeepRunner-${version}-mac-x64.zip`,
      `DeepRunner-${version}-mac-x64.zip.blockmap`,
      `DeepRunner-${version}-win-x64.exe`,
      `DeepRunner-${version}-win-x64.exe.blockmap`,
      'deeprunner.spdx.json',
      'latest-linux.yml',
      'latest-mac.yml',
      'latest.yml',
    ]
    await Promise.all(names.map(name => writeFile(resolve(directory, name), '', 'utf8')))

    const valid = await runScript('scripts/check-release-artifacts.mjs', {
      DEEPRUNNER_RELEASE_ARTIFACTS_DIR: directory,
    })
    assert.equal(valid.code, 0, valid.stderr)

    await writeFile(resolve(directory, 'AuthKey.p8'), 'secret', 'utf8')
    const extra = await runScript('scripts/check-release-artifacts.mjs', {
      DEEPRUNNER_RELEASE_ARTIFACTS_DIR: directory,
    })
    assert.notEqual(extra.code, 0)
    assert.match(extra.stderr, /sensitive-looking name/u)
    await rm(resolve(directory, 'AuthKey.p8'))

    await rm(resolve(directory, names[0]))
    await symlink(resolve(directory, names[1]), resolve(directory, names[0]))
    assert.equal((await readdir(directory)).length, names.length)
    const linked = await runScript('scripts/check-release-artifacts.mjs', {
      DEEPRUNNER_RELEASE_ARTIFACTS_DIR: directory,
    })
    assert.notEqual(linked.code, 0)
    assert.match(linked.stderr, /regular file/u)
  })
})
