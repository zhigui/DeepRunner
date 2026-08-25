/** Client Loader health submitted after the browser plugin tree settles. */
export type DeepRunnerRendererBootReport =
  | {
      readonly status: 'healthy'
      readonly generationId: string
    }
  | {
      readonly status: 'failed'
      readonly generationId: string
      readonly plugins: readonly string[]
      readonly error?: string
    }

/** Runtime-check an untrusted renderer health report. */
export function isDeepRunnerRendererBootReport(
  value: unknown,
): value is DeepRunnerRendererBootReport {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const report = value as Record<string, unknown>
  if (typeof report.generationId !== 'string' || report.generationId.length === 0) return false
  if (report.status === 'healthy') return true
  return report.status === 'failed'
    && Array.isArray(report.plugins)
    && report.plugins.every(plugin => typeof plugin === 'string')
    && (report.error === undefined || typeof report.error === 'string')
}

