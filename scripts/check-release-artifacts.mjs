import { readFile, lstat, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const directory = resolve(process.env.DEEPRUNNER_RELEASE_ARTIFACTS_DIR ?? resolve(root, 'release-artifacts'))
const rootPackage = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const version = rootPackage.version

const expected = [
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
].sort()

const actual = (await readdir(directory)).sort()
for (const name of actual) {
  const info = await lstat(resolve(directory, name))
  if (!info.isFile()) throw new Error(`release artifact must be a regular file: ${name}`)
  if (/(?:^|[._-])(authkey|credential|private|secret|token)(?:[._-]|$)|\.(?:key|p12|pfx|pem)$/iu.test(name)) {
    throw new Error(`release artifact has a sensitive-looking name: ${name}`)
  }
}

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  const missing = expected.filter(name => !actual.includes(name))
  const unexpected = actual.filter(name => !expected.includes(name))
  throw new Error(`release artifact set mismatch; missing=[${missing.join(', ')}] unexpected=[${unexpected.join(', ')}]`)
}

console.log(`verified the minimal ${actual.length}-file release artifact set`)
