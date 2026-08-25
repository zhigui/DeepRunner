import { isAbsolute, join, resolve } from 'node:path'

/** Product-private Harness home below Electron's persistent user-data root. */
export const DEEPRUNNER_DSH_HOME_DIRECTORY = 'dsh-home'

/** Resolve DeepRunner's private Harness home without consulting ambient DSH_HOME. */
export function resolveDeepRunnerDshHome(userDataDir: string): string {
  if (!isAbsolute(userDataDir)) {
    throw new TypeError('DeepRunner userData directory must be absolute')
  }
  return join(resolve(userDataDir), DEEPRUNNER_DSH_HOME_DIRECTORY)
}

/**
 * Pin every upstream DSH consumer in this process to DeepRunner's private home.
 * The supplied environment is mutated intentionally because upstream plugins
 * resolve DSH_HOME independently during Host composition.
 */
export function bindDeepRunnerDshHome(
  userDataDir: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const homeDir = resolveDeepRunnerDshHome(userDataDir)
  environment.DSH_HOME = homeDir
  return homeDir
}
