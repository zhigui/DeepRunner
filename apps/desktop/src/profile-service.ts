import type {
  DeepRunnerProfiles,
  DeepRunnerProfileSummary,
} from '@deeprunner/contracts'
import type { DeepRunnerProfileName } from '@deeprunner/contracts'
import {
  listDeepRunnerProfiles,
  selectDeepRunnerProfile,
} from './profile-manager.js'

export interface DeepRunnerProfileServiceOptions {
  readonly current: {
    readonly name: DeepRunnerProfileName
    readonly dir: string
  }
  readonly homeDir: string
  readonly statePath: string
  requestRestart(): Promise<void>
}

interface SelectionOperation {
  readonly name: string
  readonly promise: Promise<void>
}

/** Generation-scoped Profile service backed by launcher-private persistence. */
export class DeepRunnerProfileService implements DeepRunnerProfiles {
  readonly current: DeepRunnerProfiles['current']
  private disposed = false
  private operation: SelectionOperation | undefined
  private committedName: string | undefined
  private restartCompleted = false

  constructor(private readonly options: DeepRunnerProfileServiceOptions) {
    this.current = Object.freeze({ ...options.current })
  }

  list(): readonly DeepRunnerProfileSummary[] {
    this.assertActive()
    return listDeepRunnerProfiles(this.options.homeDir)
  }

  select(name: string): Promise<void> {
    try {
      this.assertActive()
      if (name === this.current.name) return Promise.resolve()
      if (this.operation !== undefined) {
        if (this.operation.name === name) return this.operation.promise
        return Promise.reject(new Error(
          `DeepRunner profile ${JSON.stringify(this.operation.name)} is already being selected`,
        ))
      }
      if (this.committedName !== undefined) {
        if (name !== this.committedName) {
          return Promise.reject(new Error(
            `DeepRunner profile ${JSON.stringify(this.committedName)} is pending restart`,
          ))
        }
        if (this.restartCompleted) return Promise.resolve()
        return this.runExclusive(name, async () => {
          await this.options.requestRestart()
          this.restartCompleted = true
        })
      }
      return this.runExclusive(name, async () => {
        selectDeepRunnerProfile(this.options.statePath, this.options.homeDir, name)
        this.committedName = name
        this.assertActive()
        await this.options.requestRestart()
        this.restartCompleted = true
      })
    } catch (cause) {
      return Promise.reject(cause)
    }
  }

  dispose(): void {
    this.disposed = true
  }

  private runExclusive(name: string, invoke: () => Promise<void>): Promise<void> {
    const promise = invoke()
    const operation = { name, promise }
    this.operation = operation
    const release = (): void => {
      if (this.operation === operation) this.operation = undefined
    }
    void promise.then(release, release)
    return promise
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('DeepRunner Profile service has been disposed')
  }
}
