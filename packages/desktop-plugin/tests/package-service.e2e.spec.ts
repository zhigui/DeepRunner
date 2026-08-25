import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { LocalSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-local'
import { afterEach, describe, expect, it } from 'vitest'
import { parseDeepRunnerProfileName } from '@deeprunner/contracts'
import { DeepRunnerPackageService } from '../src/package-service.js'

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'm4-plugin')
const FIXTURE_NAME = 'deeprunner-m4-plugin-fixture'
const services: DeepRunnerPackageService[] = []
const contexts: Context[] = []

function serviceFixture(): {
  readonly service: DeepRunnerPackageService
  readonly profileDir: string
  readonly fixtureDir: string
} {
  const root = mkdtempSync(join(tmpdir(), 'deeprunner-package-e2e-'))
  const profileDir = join(root, 'home', 'profiles', 'm4test')
  const fixtureDir = join(root, 'fixture source', 'm4-plugin')
  mkdirSync(profileDir, { recursive: true })
  cpSync(FIXTURE_DIR, fixtureDir, { recursive: true })
  const context = new Context()
  const service = new DeepRunnerPackageService({
    profiles: {
      current: { name: parseDeepRunnerProfileName('m4test'), dir: profileDir },
      list: () => [],
      select: async () => {},
    },
    subprocess: new LocalSubprocessRuntime(context),
    deadlineMs: 30_000,
    terminationGraceMs: 250,
  })
  services.push(service)
  contexts.push(context)
  return { service, profileDir, fixtureDir }
}

async function output(handle: ReturnType<DeepRunnerPackageService['runPlugin']>): Promise<{
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number | null
}> {
  let stdout = ''
  let stderr = ''
  handle.stdout.setEncoding('utf8')
  handle.stderr.setEncoding('utf8')
  handle.stdout.on('data', chunk => { stdout += String(chunk) })
  handle.stderr.on('data', chunk => { stderr += String(chunk) })
  const outcome = await handle.done
  return { stdout, stderr, exitCode: outcome.exitCode }
}

async function waitForChildPid(stream: NodeJS.ReadableStream): Promise<number> {
  stream.setEncoding('utf8')
  return await new Promise<number>((resolve, reject) => {
    let text = ''
    const timer = setTimeout(() => { reject(new Error('fixture child pid timed out')) }, 10_000)
    stream.on('data', chunk => {
      text += String(chunk)
      const match = /DEEPRUNNER_CHILD_PID=(\d+)/u.exec(text)
      if (match?.[1] === undefined) return
      clearTimeout(timer)
      resolve(Number(match[1]))
    })
  })
}

async function waitForProcessExit(pid: number): Promise<boolean> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      process.kill(pid, 0)
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ESRCH') return true
      throw cause
    }
    await new Promise(resolve => { setTimeout(resolve, 20) })
  }
  return false
}

afterEach(async () => {
  await Promise.allSettled(services.splice(0).map(service => service.dispose()))
  await Promise.allSettled(contexts.splice(0).map(context => context.fiber.dispose()))
})

describe('DeepRunner Package service integration', () => {
  it('installs, reconciles, and removes a real local DSH Bundle', async () => {
    const { service, profileDir, fixtureDir } = serviceFixture()
    const installed = await output(service.runPlugin(['add', `file:${fixtureDir}`], fixtureDir))
    expect(installed.exitCode, installed.stderr).toBe(0)

    const manifestPath = join(profileDir, 'package.json')
    const added = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      dependencies?: Record<string, string>
      dsh?: { profile?: { bundles?: string[] } }
    }
    expect(added.dependencies).toHaveProperty(FIXTURE_NAME)
    expect(added.dsh?.profile?.bundles).toContain(FIXTURE_NAME)
    expect(existsSync(join(profileDir, 'node_modules', FIXTURE_NAME, 'cordis.patch.yml'))).toBe(true)

    const removed = await output(service.runPlugin(['remove', FIXTURE_NAME], fixtureDir))
    expect(removed.exitCode, removed.stderr).toBe(0)
    const after = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      dependencies?: Record<string, string>
      dsh?: { profile?: { bundles?: string[] } }
    }
    expect(after.dependencies ?? {}).not.toHaveProperty(FIXTURE_NAME)
    expect(after.dsh?.profile?.bundles).not.toContain(FIXTURE_NAME)
    expect(existsSync(join(profileDir, 'node_modules', FIXTURE_NAME))).toBe(false)
  }, 30_000)

  it('cancels and joins a real descendant process tree', async () => {
    const { service, fixtureDir } = serviceFixture()
    const handle = service.runPnpm(['--dir', fixtureDir, 'run', 'hold-tree'])
    const childPid = await waitForChildPid(handle.stdout)
    expect(childPid).toBeGreaterThan(0)
    handle.cancel()
    const outcome = await handle.done
    expect(outcome.exitCode === null || outcome.exitCode !== 0).toBe(true)
    expect(await waitForProcessExit(childPid)).toBe(true)
  }, 30_000)

  it('disposes and joins a real descendant process tree', async () => {
    const { service, fixtureDir } = serviceFixture()
    const handle = service.runPnpm(['--dir', fixtureDir, 'run', 'hold-tree'])
    const childPid = await waitForChildPid(handle.stdout)
    await service.dispose()
    await expect(handle.done).resolves.toMatchObject({ exitCode: null })
    expect(await waitForProcessExit(childPid)).toBe(true)
  }, 30_000)
})
