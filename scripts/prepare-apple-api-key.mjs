import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const encodedKey = process.env.DEEPRUNNER_APPLE_API_KEY_B64
if (encodedKey === undefined || encodedKey.trim() === '') {
  throw new Error('DEEPRUNNER_APPLE_API_KEY_B64 is required for macOS notarization')
}

const key = Buffer.from(encodedKey.replaceAll(/\s/gu, ''), 'base64')
const keyText = key.toString('utf8')
if (!keyText.includes('-----BEGIN PRIVATE KEY-----') || !keyText.includes('-----END PRIVATE KEY-----')) {
  throw new Error('DEEPRUNNER_APPLE_API_KEY_B64 is not a base64-encoded App Store Connect .p8 private key')
}

const secretsDirectory = resolve(import.meta.dirname, '..', '.release-secrets')
const keyPath = resolve(secretsDirectory, 'AuthKey.p8')
await mkdir(secretsDirectory, { recursive: true, mode: 0o700 })
await writeFile(keyPath, key, { mode: 0o600 })
console.log(`prepared Apple API key at ${keyPath}`)
