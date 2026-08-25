/** Runtime-check an untrusted renderer health report. */
export function isDeepRunnerRendererBootReport(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return false;
    const report = value;
    if (typeof report.generationId !== 'string' || report.generationId.length === 0)
        return false;
    if (report.status === 'healthy')
        return true;
    return report.status === 'failed'
        && Array.isArray(report.plugins)
        && report.plugins.every(plugin => typeof plugin === 'string')
        && (report.error === undefined || typeof report.error === 'string');
}
//# sourceMappingURL=renderer-boot.js.map