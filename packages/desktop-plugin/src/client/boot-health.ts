import { DEEPRUNNER_RENDERER_BOOT_PATH } from '../transport-paths.js'
import type { DeepRunnerRendererBootReport } from '@deeprunner/contracts'

export interface DeepRunnerRendererBootLoader {
  await(): Promise<void>
  entries(): Iterable<{
    options: { name: string }
    fiber?: { state: number }
  }>
}

const ACTIVE_FIBER_STATE = 2

/** Wait for the complete Client Loader tree, not merely navigation completion. */
export async function deepRunnerRendererBootReport(
  loader: DeepRunnerRendererBootLoader,
  generationId: string,
): Promise<DeepRunnerRendererBootReport> {
  let error: string | undefined
  try {
    await loader.await()
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause)
  }
  const plugins = [...loader.entries()]
    .filter(entry => entry.fiber?.state !== ACTIVE_FIBER_STATE)
    .map(entry => entry.options.name)
  return error === undefined && plugins.length === 0
    ? { status: 'healthy', generationId }
    : {
        status: 'failed',
        generationId,
        plugins,
        ...(error === undefined ? {} : { error }),
      }
}

/** Defer the report until the plugin's own apply phase has returned to the Loader. */
export function startDeepRunnerRendererBootReporter(
  loader: DeepRunnerRendererBootLoader,
  generationId: string,
  request: typeof globalThis.fetch = globalThis.fetch,
): () => void {
  let active = true
  const timer = setTimeout(() => {
    void deepRunnerRendererBootReport(loader, generationId)
      .then(async (report) => {
        if (!active) return
        const response = await request(DEEPRUNNER_RENDERER_BOOT_PATH, {
          method: 'POST',
          cache: 'no-store',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(report),
        })
        if (!response.ok) throw new Error(`renderer boot report failed with HTTP ${String(response.status)}`)
      })
      .catch((cause: unknown) => {
        console.error('DeepRunner failed to report renderer boot health', cause)
      })
  }, 0)
  return () => {
    active = false
    clearTimeout(timer)
  }
}
