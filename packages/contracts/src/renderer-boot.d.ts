/** Client Loader health submitted after the browser plugin tree settles. */
export type DeepRunnerRendererBootReport = {
    readonly status: 'healthy';
    readonly generationId: string;
} | {
    readonly status: 'failed';
    readonly generationId: string;
    readonly plugins: readonly string[];
    readonly error?: string;
};
/** Runtime-check an untrusted renderer health report. */
export declare function isDeepRunnerRendererBootReport(value: unknown): value is DeepRunnerRendererBootReport;
//# sourceMappingURL=renderer-boot.d.ts.map