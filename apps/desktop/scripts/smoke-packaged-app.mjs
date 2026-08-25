/** Launch one packaged application with isolated state and await Renderer health. */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEEPRUNNER_PACKAGED_SMOKE_ENV,
  DEEPRUNNER_PACKAGED_SMOKE_PREFIX,
} from '../lib/packaged-smoke.js'
import {
  assertPackagedAppLayout,
  cleanPackagedSmokeEnvironment,
  extractPackagedSmokeReport,
  resolvePackagedAppLayout,
  resolveSmokeAppArgument,
} from './packaged-smoke-helpers.mjs'

const APP_TIMEOUT_MS = 60_000
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024

function terminateProcessTree(child, platform, environment) {
  if (child.pid === undefined) return
  if (platform === 'win32') {
    const taskkill = join(environment.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe')
    spawnSync(taskkill, ['/pid', String(child.pid), '/t', '/f'], {
      env: environment,
      shell: false,
      stdio: 'ignore',
    })
    return
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}

function appendOutput(current, chunk, label) {
  const next = current + chunk.toString('utf8')
  if (Buffer.byteLength(next) > MAX_OUTPUT_BYTES) {
    throw new Error(`DeepRunner packaged ${label} exceeded ${String(MAX_OUTPUT_BYTES)} output bytes`)
  }
  return next
}

export async function smokePackagedApp(layout, platform = process.platform) {
  assertPackagedAppLayout(layout)
  const stateRoot = mkdtempSync(join(tmpdir(), 'deeprunner-packaged-app-smoke-'))
  const environment = cleanPackagedSmokeEnvironment(process.env, platform)
  environment[DEEPRUNNER_PACKAGED_SMOKE_ENV] = '1'
  environment.ELECTRON_ENABLE_LOGGING = '1'
  environment.HOME = stateRoot
  environment.USERPROFILE = stateRoot
  environment.XDG_CACHE_HOME = join(stateRoot, 'xdg-cache')
  environment.XDG_CONFIG_HOME = join(stateRoot, 'xdg-config')
  environment.XDG_DATA_HOME = join(stateRoot, 'xdg-data')

  let stdout = ''
  let stderr = ''
  let timedOut = false
  let outputFailure
  try {
    const child = spawn(layout.executablePath, [
      `--user-data-dir=${join(stateRoot, 'user-data')}`,
    ], {
      cwd: stateRoot,
      detached: platform !== 'win32',
      env: environment,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.on('data', (chunk) => {
      try {
        stdout = appendOutput(stdout, chunk, 'stdout')
      } catch (cause) {
        outputFailure = cause
        terminateProcessTree(child, platform, environment)
      }
    })
    child.stderr.on('data', (chunk) => {
      try {
        stderr = appendOutput(stderr, chunk, 'stderr')
      } catch (cause) {
        outputFailure = cause
        terminateProcessTree(child, platform, environment)
      }
    })

    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        timedOut = true
        terminateProcessTree(child, platform, environment)
      }, APP_TIMEOUT_MS)
      child.once('error', (cause) => {
        clearTimeout(timeout)
        reject(cause)
      })
      // Electron descendants inherit the captured pipes. Waiting for `close`
      // can therefore hang after the main process has already exited; `exit`
      // is the lifecycle boundary this smoke test actually needs.
      child.once('exit', (code, signal) => {
        clearTimeout(timeout)
        terminateProcessTree(child, platform, environment)
        resolve({ code, signal })
      })
    })
    if (outputFailure !== undefined) throw outputFailure
    if (timedOut) {
      throw new Error(`DeepRunner packaged application timed out after ${String(APP_TIMEOUT_MS)}ms\n${stderr.trim()}`)
    }
    const report = extractPackagedSmokeReport(stdout, DEEPRUNNER_PACKAGED_SMOKE_PREFIX)
    if (report === undefined) {
      throw new Error(
        `DeepRunner packaged application exited without a Renderer health report `
        + `(code=${String(result.code)}, signal=${String(result.signal)})\n${stderr.trim()}`,
      )
    }
    if (report.status !== 'healthy') {
      throw new Error(`DeepRunner packaged Renderer reported failure: ${JSON.stringify(report)}`)
    }
    if (result.code !== 0) {
      throw new Error(`DeepRunner packaged application exited ${String(result.code)} after a healthy report\n${stderr.trim()}`)
    }
    return report
  } finally {
    rmSync(stateRoot, { recursive: true, force: true })
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const appArgument = process.argv[2]
  if (appArgument === undefined) {
    throw new Error('Usage: smoke-packaged-app <path-to-app-directory>')
  }
  const appPath = resolveSmokeAppArgument(appArgument)
  const report = await smokePackagedApp(resolvePackagedAppLayout(appPath))
  console.log(`Verified DeepRunner packaged application Renderer health (${report.generationId}): ${appPath}`)
}
