/** Exercise packaged command entries and native modules with the bundled Electron runtime. */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertPackagedAppLayout,
  cleanPackagedSmokeEnvironment,
  resolvePackagedAppLayout,
  resolveSmokeAppArgument,
} from './packaged-smoke-helpers.mjs'

const COMMAND_TIMEOUT_MS = 30_000
const MAX_OUTPUT_BYTES = 1024 * 1024

function packageVersion(unpackedRoot, packageName) {
  const manifest = JSON.parse(readFileSync(join(
    unpackedRoot,
    'node_modules',
    ...packageName.split('/'),
    'package.json',
  ), 'utf8'))
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error(`DeepRunner packaged ${packageName} has no version`)
  }
  return manifest.version
}

function verifyResult(label, result, expectedOutput) {
  if (result.error !== undefined) throw result.error
  if (result.signal !== null) {
    throw new Error(`${label} packaged smoke was terminated by ${String(result.signal)}`)
  }
  if (result.status !== 0) {
    throw new Error(`${label} packaged smoke exited ${String(result.status)}: ${result.stderr.trim()}`)
  }
  const output = result.stdout.trim()
  if (output !== expectedOutput) {
    throw new Error(`${label} packaged smoke returned ${JSON.stringify(output)} instead of ${JSON.stringify(expectedOutput)}`)
  }
}

function runAsPackagedNode(layout, label, args, expectedOutput, run = spawnSync) {
  const environment = cleanPackagedSmokeEnvironment()
  environment.ELECTRON_RUN_AS_NODE = '1'
  const result = run(layout.executablePath, args, {
    cwd: layout.unpackedRoot,
    encoding: 'utf8',
    env: environment,
    maxBuffer: MAX_OUTPUT_BYTES,
    shell: false,
    timeout: COMMAND_TIMEOUT_MS,
  })
  verifyResult(label, result, expectedOutput)
}

export function smokePackagedRuntime(layout) {
  assertPackagedAppLayout(layout)
  const dshEntry = join(layout.unpackedRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  const pnpmEntry = join(layout.unpackedRoot, 'node_modules', 'pnpm', 'bin', 'pnpm.mjs')
  runAsPackagedNode(
    layout,
    'DSH CLI',
    [dshEntry, '--version'],
    packageVersion(layout.unpackedRoot, '@deepseek-ai/dsh'),
  )
  runAsPackagedNode(
    layout,
    'pnpm CLI',
    [pnpmEntry, '--version'],
    packageVersion(layout.unpackedRoot, 'pnpm'),
  )

  const nativeProbe = [
    "const { createRequire } = require('node:module')",
    `const requireFromApp = createRequire(${JSON.stringify(join(layout.unpackedRoot, 'package.json'))})`,
    "const pty = requireFromApp('node-pty')",
    "const koffi = requireFromApp('koffi')",
    "if (typeof pty.spawn !== 'function') throw new Error('node-pty did not expose spawn')",
    "if (typeof koffi.load !== 'function') throw new Error('koffi did not expose load')",
    "process.stdout.write('native-ok')",
  ].join('\n')
  runAsPackagedNode(layout, 'native modules', ['-e', nativeProbe], 'native-ok')

  const m4Probe = [
    '(async () => {',
    "const { mkdirSync, mkdtempSync } = require('node:fs')",
    "const { spawnSync } = require('node:child_process')",
    "const { tmpdir } = require('node:os')",
    "const { join } = require('node:path')",
    "const { pathToFileURL } = require('node:url')",
    `const unpackedRoot = ${JSON.stringify(layout.unpackedRoot)}`,
    `const executablePath = ${JSON.stringify(layout.executablePath)}`,
    "const load = path => import(pathToFileURL(path).href)",
    "const { Context } = await load(join(unpackedRoot, 'node_modules', '@deepseek-ai', 'cordis', 'lib', 'index.js'))",
    "const { LocalSubprocessRuntime } = await load(join(unpackedRoot, 'node_modules', '@deepseek-ai', 'dsh-subprocess-local', 'lib', 'index.js'))",
    "const { DeepRunnerPackageService } = await load(join(unpackedRoot, 'node_modules', '@deeprunner', 'desktop-plugin', 'lib', 'index.js'))",
    "const { prepareDeepRunnerTerminal } = await load(join(unpackedRoot, 'lib', 'system-terminal.js'))",
    "const root = mkdtempSync(join(tmpdir(), 'deeprunner-packaged-m4-'))",
    "const profileDir = join(root, 'home', 'profiles', 'packaged')",
    'mkdirSync(profileDir, { recursive: true })',
    'const context = new Context()',
    'const service = new DeepRunnerPackageService({',
    "profiles: { current: { name: 'packaged', dir: profileDir }, list: () => [], select: async () => {} },",
    'subprocess: new LocalSubprocessRuntime(context), deadlineMs: 30000,',
    '})',
    "const handle = service.runPlugin(['--version'], root)",
    "let output = ''",
    "handle.stdout.setEncoding('utf8')",
    "handle.stdout.on('data', chunk => { output += chunk })",
    'const outcome = await handle.done',
    'await service.dispose()',
    'await context.fiber.dispose()',
    "if (outcome.exitCode !== 0 || output.trim().length === 0) throw new Error('packaged runPlugin failed')",
    'const terminal = prepareDeepRunnerTerminal({',
    "rootDir: root, generationId: 'packaged-smoke', platform: process.platform, version: 'smoke',",
    "profile: { name: 'packaged', dir: profileDir }, executablePath,",
    "dshEntryPath: join(unpackedRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),",
    "pnpmEntryPath: join(unpackedRoot, 'node_modules', 'pnpm', 'bin', 'pnpm.mjs'),",
    '})',
    "if (!terminal.entryPath.startsWith(root)) throw new Error('packaged Terminal escaped private root')",
    "const terminalCommand = process.platform === 'win32' ? join(terminal.directory, 'dsh.cmd') : join(terminal.directory, 'dsh')",
    "const terminalResult = process.platform === 'win32'",
    "  ? spawnSync('cmd.exe', ['/d', '/s', '/c', terminalCommand, '--version'], { encoding: 'utf8', env: process.env })",
    "  : spawnSync(terminalCommand, ['--version'], { encoding: 'utf8', env: process.env })",
    "if (terminalResult.status !== 0 || terminalResult.stdout.trim().length === 0) throw new Error('packaged Terminal command failed')",
    "process.stdout.write('m4-ok')",
    '})().catch(cause => { console.error(cause); process.exitCode = 1 })',
  ].join('\n')
  runAsPackagedNode(layout, 'M4 package and Terminal runtime', ['-e', m4Probe], 'm4-ok')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const appArgument = process.argv[2]
  if (appArgument === undefined) {
    throw new Error('Usage: smoke-packaged-runtime <path-to-app-directory>')
  }
  const appPath = resolveSmokeAppArgument(appArgument)
  const layout = resolvePackagedAppLayout(appPath)
  smokePackagedRuntime(layout)
  console.log(`Verified DeepRunner packaged commands, M4 services, and native modules: ${appPath}`)
}
