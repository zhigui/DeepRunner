import { existsSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

const RUNNER_ONLY_ENVIRONMENT = new Set([
  'ELECTRON_RUN_AS_NODE',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NPM_CONFIG_DISTURL',
  'NPM_CONFIG_RUNTIME',
  'NPM_CONFIG_TARGET',
])

/** Locate a CLI path from the caller or one of its workspace ancestors. */
export function resolveSmokeAppArgument(appArgument, cwd = process.cwd(), exists = existsSync) {
  if (isAbsolute(appArgument)) return appArgument
  let base = resolve(cwd)
  while (true) {
    const candidate = resolve(base, appArgument)
    if (exists(candidate)) return candidate
    const parent = dirname(base)
    if (parent === base) return resolve(cwd, appArgument)
    base = parent
  }
}

/** Resolve the executable and physical dependency root of one unpacked application. */
export function resolvePackagedAppLayout(appPath, platform = process.platform) {
  const absoluteAppPath = resolve(appPath)
  if (platform === 'darwin') {
    const productName = basename(absoluteAppPath, '.app')
    const resourcesPath = join(absoluteAppPath, 'Contents', 'Resources')
    return {
      appPath: absoluteAppPath,
      executablePath: join(absoluteAppPath, 'Contents', 'MacOS', productName),
      resourcesPath,
      unpackedRoot: join(resourcesPath, 'app.asar.unpacked'),
    }
  }
  if (platform === 'win32') {
    const resourcesPath = join(absoluteAppPath, 'resources')
    return {
      appPath: absoluteAppPath,
      executablePath: join(absoluteAppPath, 'DeepRunner.exe'),
      resourcesPath,
      unpackedRoot: join(resourcesPath, 'app.asar.unpacked'),
    }
  }
  if (platform === 'linux') {
    const resourcesPath = join(absoluteAppPath, 'resources')
    return {
      appPath: absoluteAppPath,
      executablePath: join(absoluteAppPath, 'deeprunner'),
      resourcesPath,
      unpackedRoot: join(resourcesPath, 'app.asar.unpacked'),
    }
  }
  throw new Error(`DeepRunner packaged smoke does not support ${JSON.stringify(platform)}`)
}

/** Remove developer Node injection and replace PATH with the OS command baseline. */
export function cleanPackagedSmokeEnvironment(source = process.env, platform = process.platform) {
  const environment = {}
  for (const [key, value] of Object.entries(source)) {
    const normalized = key.toUpperCase()
    if (normalized === 'PATH' || RUNNER_ONLY_ENVIRONMENT.has(normalized)) continue
    if (value !== undefined) environment[key] = value
  }
  environment.PATH = platform === 'win32'
    ? join(environment.SystemRoot ?? 'C:\\Windows', 'System32')
    : '/usr/bin:/bin'
  return environment
}

/** Fail loudly for an absent application layout before launching any child. */
export function assertPackagedAppLayout(layout, exists = existsSync) {
  for (const [label, filename] of [
    ['application executable', layout.executablePath],
    ['physical runtime root', layout.unpackedRoot],
  ]) {
    if (!exists(filename)) throw new Error(`DeepRunner packaged smoke is missing ${label}: ${filename}`)
  }
}

/** Parse the last well-formed renderer report written by a packaged application. */
export function extractPackagedSmokeReport(output, prefix) {
  const candidates = output.split(/\r?\n/u).filter(line => line.startsWith(prefix))
  for (const line of candidates.reverse()) {
    try {
      const value = JSON.parse(line.slice(prefix.length))
      if (value !== null
        && typeof value === 'object'
        && (value.status === 'healthy' || value.status === 'failed')
        && typeof value.generationId === 'string'
        && value.generationId.length > 0) {
        return value
      }
    } catch {
      // Keep looking so unrelated or partially flushed output cannot spoof success.
    }
  }
  return undefined
}
