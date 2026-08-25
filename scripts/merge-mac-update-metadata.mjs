import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { load, dump } from 'js-yaml'

const directory = resolve(process.env.DEEPRUNNER_RELEASE_ARTIFACTS_DIR ?? resolve(import.meta.dirname, '..', 'release-artifacts'))
const architectures = ['arm64', 'x64']
const documents = await Promise.all(architectures.map(async architecture => {
  const path = resolve(directory, `latest-mac-${architecture}.yml`)
  const value = load(await readFile(path, 'utf8'))
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} is not an update metadata object`)
  if (!Array.isArray(value.files) || value.files.length === 0) throw new Error(`${path} has no update files`)
  return value
}))

const [first, ...rest] = documents
if (first === undefined) throw new Error('no macOS update metadata found')
if (rest.some(document => document.version !== first.version)) throw new Error('macOS update metadata versions differ')

const files = documents.flatMap(document => document.files)
if (!files.some(file => typeof file?.url === 'string' && file.url.includes('arm64'))) throw new Error('macOS update metadata has no arm64 file')
if (!files.some(file => typeof file?.url === 'string' && file.url.includes('x64'))) throw new Error('macOS update metadata has no x64 file')

const output = {
  ...first,
  files,
  path: undefined,
  sha512: undefined,
}
await writeFile(resolve(directory, 'latest-mac.yml'), dump(output, { lineWidth: -1, noRefs: true }), 'utf8')
console.log(`merged ${files.length} macOS update files for ${String(first.version)}`)
