import type { DeepRunnerRendererBootReport } from '../renderer-boot.js';
export type DeepRunnerPlatform = 'darwin' | 'win32' | 'linux';
export type DeepRunnerShellMode = 'compatibility' | 'advanced';
export interface DeepRunnerShellSpec {
    readonly generationId: string;
    readonly mode: DeepRunnerShellMode;
    readonly url: string;
    readonly title: string;
    readonly width: number;
    readonly height: number;
    readonly minWidth: number;
    readonly minHeight: number;
    requestQuit(code: number): void;
}
/** Internal native adapter provided by the Electron launcher. */
export interface DeepRunnerRuntime {
    readonly generationId: string;
    readonly platform: DeepRunnerPlatform;
    schedule(spec: DeepRunnerShellSpec): () => Promise<void>;
    mountScheduled(): Promise<void>;
    show(): void;
    reportRendererBoot(report: DeepRunnerRendererBootReport): void;
    requestRestart(): Promise<void>;
    prepareToQuit(): void;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        deepRunnerRuntime: DeepRunnerRuntime;
    }
}
//# sourceMappingURL=runtime.d.ts.map