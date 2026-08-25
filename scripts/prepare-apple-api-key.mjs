import { createPrivateKey } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'

const encodedKey = process.env.DEEPRUNNER_APPLE_API_KEY_B64
if (encodedKey === undefined || encodedKey.trim() === '') {
  throw new Error('DEEPRUNNER_APPLE_API_KEY_B64 is required for macOS notarization')
}

delete process.env.DEEPRUNNER_APPLE_API_KEY_B64

const normalizedKey = encodedKey.replaceAll(/\s/gu, '')
if (normalizedKey.length === 0 || normalizedKey.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(normalizedKey)) {
  throw new Error('DEEPRUNNER_APPLE_API_KEY_B64 is not valid base64')
}

const configuredKeyPath = process.env.APPLE_API_KEY
if (configuredKeyPath === undefined || !isAbsolute(configuredKeyPath)) {
  throw new Error('APPLE_API_KEY must be an absolute temporary file path')
}

const key = Buffer.from(normalizedKey, 'base64')
try {
  const keyText = key.toString('utf8')
  if (!/^-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----\s*$/u.test(keyText)) {
    throw new Error('DEEPRUNNER_APPLE_API_KEY_B64 is not a PKCS#8 PEM private key')
  }

  let privateKey
  try {
    privateKey = createPrivateKey(key)
  } catch {
    throw new Error('DEEPRUNNER_APPLE_API_KEY_B64 does not contain a valid private key')
  }
  if (privateKey.asymmetricKeyType !== 'ec' || privateKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw new Error('App Store Connect API key must be an EC P-256 private key')
  }

  const keyPath = resolve(configuredKeyPath)
  await mkdir(dirname(keyPath), { recursive: true, mode: 0o700 })
  await writeFile(keyPath, key, { mode: 0o600, flag: 'wx' })
} finally {
  key.fill(0)
}

console.log('prepared a temporary Apple API key for notarization')
