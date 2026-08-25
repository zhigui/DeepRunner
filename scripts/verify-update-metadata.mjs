import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { load } from 'js-yaml'

const directory = resolve(process.env.DEEPRUNNER_RELEASE_ARTIFACTS_DIR ?? resolve(import.meta.dirname, '..', 'release-artifacts'))
const metadataNames = ['latest.yml', 'latest-mac.yml', 'latest-linux.yml']
let verified = 0

for (const metadataName of metadataNames) {
  const metadataPath = resolve(directory, metadataName)
  const metadata = load(await readFile(metadataPath, 'utf8'))
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error(`${metadataName} is not an object`)
  if (!Array.isArray(metadata.files) || metadata.files.length === 0) throw new Error(`${metadataName} has no files`)
  for (const file of metadata.files) {
    if (file === null || typeof file !== 'object' || typeof file.url !== 'string' || typeof file.sha512 !== 'string') {
      throw new Error(`${metadataName} has an invalid file entry`)
    }
    const filename = decodeURIComponent(basename(file.url))
    const path = resolve(directory, filename)
    const bytes = await readFile(path)
    const info = await stat(path)
    if (typeof file.size === 'number' && info.size !== file.size) throw new Error(`${filename} size mismatch`)
    const sha512 = createHash('sha512').update(bytes).digest('base64')
    if (sha512 !== file.sha512) throw new Error(`${filename} SHA-512 mismatch`)
    verified += 1
  }
}

console.log(`verified ${verified} files from electron-updater metadata`)
