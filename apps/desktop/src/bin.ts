import { app } from 'electron'
import { inspect } from 'node:util'
import {
  bootDeepRunnerHostGeneration,
  deepRunnerHostRecoveryContext,
  requestDeepRunnerHostSafeMode,
} from './host-generation.js'
import { startDeepRunnerDesktop } from './main.js'
import { selectDeepRunnerProfile } from './profile-manager.js'
import { planDeepRunnerBootRecovery } from './profile-recovery.js'
import { mountDeepRunnerRecoveryWindow } from './profile-recovery-window.js'

void startDeepRunnerDesktop({
  boot: (runtime, requestExit) => bootDeepRunnerHostGeneration(runtime, requestExit),
  recover: async (cause, controls) => {
    const recovery = deepRunnerHostRecoveryContext()
    const plan = planDeepRunnerBootRecovery(
      recovery.statePath,
      recovery.homeDir,
      cause,
    )
    if (plan.kind === 'automatic-rollback') {
      process.stderr.write(
        `deeprunner: profile ${plan.failedProfile} failed; restarting with ${plan.targetProfile}\n`,
      )
      return 'relaunch'
    }
    return mountDeepRunnerRecoveryWindow({
      model: plan.model,
      selectProfile: name => {
        selectDeepRunnerProfile(recovery.statePath, recovery.homeDir, name)
      },
      requestSafeMode: requestDeepRunnerHostSafeMode,
      requestRestart: controls.requestRestart,
      requestExit: () => { controls.requestExit(1) },
    })
  },
}).catch((cause: unknown) => {
  process.stderr.write(`deeprunner: ${inspect(cause, { depth: 12 })}\n`)
  app.exit(1)
})
