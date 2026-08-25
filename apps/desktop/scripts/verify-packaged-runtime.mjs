import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listPackage } from '@electron/asar'

export const REQUIRED_ARCHIVE_ENTRIES = [
  'package.json',
  'lib/bin.js',
  'lib/host-generation.js',
  'lib/system-terminal.js',
  'lib/packaged-runtime-path.js',
  'lib/packaged-smoke.js',
  'node_modules/@deeprunner/contracts/package.json',
  'node_modules/@deeprunner/desktop-plugin/package.json',
  'node_modules/@deeprunner/desktop-plugin/lib/package-service.js',
  'node_modules/@deeprunner/plugin-market/package.json',
  'node_modules/@deeprunner/plugin-market/lib/index.js',
  'node_modules/@deeprunner/plugin-market/lib/client.js',
  'node_modules/@deepseek-ai/dsh/package.json',
  'node_modules/@deepseek-ai/dsh/lib/bin.js',
  'node_modules/@deepseek-ai/dsh/config/agent-presets/standard/agent.cordis.yml',
  'node_modules/@deepseek-ai/dsh-app-boot/package.json',
  'node_modules/@deepseek-ai/dsh-web-app/package.json',
  'node_modules/pnpm/bin/pnpm.mjs',
  'node_modules/node-pty/package.json',
  'node_modules/koffi/package.json',
]

export const REQUIRED_PHYSICAL_PACKAGE_EXPORTS = [
  '@deeprunner/contracts',
  '@deeprunner/desktop-plugin/package.json',
  '@deeprunner/plugin-market/package.json',
  '@deepseek-ai/dsh/package.json',
  '@deepseek-ai/dsh-app-boot/package.json',
  '@deepseek-ai/dsh-web-app/package.json',
  'node-pty/package.json',
  'koffi',
]

function normalizeArchiveEntry(entry) {
  return entry.replaceAll('\\', '/').replace(/^\/+|\/+$/gu, '')
}

export function resolvePackagedAsarPath(context) {
  if (context.electronPlatformName === 'darwin') {
    return join(
      context.appOutDir,
      `${context.packager.appInfo.productFilename}.app`,
      'Contents',
      'Resources',
      'app.asar',
    )
  }
  if (context.electronPlatformName === 'win32' || context.electronPlatformName === 'linux') {
    return join(context.appOutDir, 'resources', 'app.asar')
  }
  throw new Error(`DeepRunner does not support packaged platform ${JSON.stringify(context.electronPlatformName)}`)
}

export function verifyPhysicalPackageResolution(unpackedRoot, resolvePackage) {
  const resolve = resolvePackage ?? createRequire(join(unpackedRoot, 'package.json')).resolve
  for (const specifier of REQUIRED_PHYSICAL_PACKAGE_EXPORTS) {
    let filename
    try {
      filename = resolve(specifier)
    } catch (cause) {
      throw new Error(`DeepRunner packaged runtime cannot resolve ${specifier} from ${unpackedRoot}`, { cause })
    }
    const child = relative(unpackedRoot, filename)
    if (!isAbsolute(filename)
      || child === '..'
      || child.startsWith(`..${sep}`)
      || isAbsolute(child)) {
      throw new Error(`DeepRunner packaged dependency escaped app.asar.unpacked: ${specifier} -> ${filename}`)
    }
  }
}

export function verifyPackagedRuntime(
  context,
  list = listPackage,
  exists = existsSync,
  resolvePackage,
) {
  const asarPath = resolvePackagedAsarPath(context)
  const unpackedRoot = `${asarPath}.unpacked`
  const entries = new Set(list(asarPath, { isPack: false }).map(normalizeArchiveEntry))
  const missingArchive = REQUIRED_ARCHIVE_ENTRIES.filter(entry => !entries.has(entry))
  if (missingArchive.length > 0) {
    throw new Error(`DeepRunner app.asar is missing runtime entries: ${missingArchive.join(', ')}`)
  }
  if ([...entries].some(entry => entry === 'node_modules/electron'
    || entry.startsWith('node_modules/electron/'))) {
    throw new Error('DeepRunner packaged runtime contains a duplicate node_modules/electron')
  }
  const missingPhysical = [...entries]
    .filter(entry => entry.length > 0 && !exists(join(unpackedRoot, entry)))
  if (missingPhysical.length > 0) {
    throw new Error(`DeepRunner app.asar.unpacked is missing mirrored entries: ${missingPhysical.join(', ')}`)
  }
  verifyPhysicalPackageResolution(unpackedRoot, resolvePackage)
}

export function resolveAppArgument(appArgument, cwd = process.cwd()) {
  if (isAbsolute(appArgument)) return appArgument
  let base = resolve(cwd)
  while (true) {
    const candidate = resolve(base, appArgument)
    if (existsSync(candidate)) return candidate
    const parent = dirname(base)
    if (parent === base) return resolve(cwd, appArgument)
    base = parent
  }
}

export default async function afterPack(context) {
  verifyPackagedRuntime(context)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const appArgument = process.argv[2]
  if (appArgument === undefined) {
    throw new Error('Usage: verify-packaged-runtime <path-to-app-directory>')
  }
  const appPath = resolveAppArgument(appArgument)
  const productFilename = process.platform === 'darwin'
    ? basename(appPath, '.app')
    : 'DeepRunner'
  verifyPackagedRuntime({
    appOutDir: process.platform === 'darwin' ? dirname(appPath) : appPath,
    electronPlatformName: process.platform,
    packager: { appInfo: { productFilename } },
  })
  console.log(`Verified DeepRunner packaged runtime: ${appPath}`)
}
