import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { load } from 'js-yaml'

const root = resolve(import.meta.dirname, '..')
const workflowDirectory = resolve(root, '.github/workflows')
const workflowFiles = (await readdir(workflowDirectory)).filter(name => /\.ya?ml$/u.test(name)).sort()
const workflows = new Map()

for (const filename of workflowFiles) {
  const path = resolve(workflowDirectory, filename)
  const source = await readFile(path, 'utf8')
  const workflow = load(source)
  assert(workflow !== null && typeof workflow === 'object' && !Array.isArray(workflow), `${filename} must contain a workflow object`)
  assert(!/\bpull_request_target\b|\bworkflow_run\b/u.test(source), `${filename} must not use a privileged untrusted-code trigger`)
  assert.deepEqual(workflow.permissions, { contents: 'read' }, `${filename} must default to contents: read`)
  assert(workflow.concurrency !== undefined, `${filename} must define concurrency behavior`)

  for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
    assert(job['timeout-minutes'] !== undefined, `${filename}:${jobName} must have a timeout`)
    const jobText = JSON.stringify(job)
    assert(!JSON.stringify(job.env ?? {}).includes('${{ secrets.'), `${filename}:${jobName} must not expose secrets through job-level env`)

    for (const step of job.steps ?? []) {
      if (typeof step.uses === 'string' && !step.uses.startsWith('./')) {
        assert.match(step.uses, /^actions\/[a-z0-9-]+@[0-9a-f]{40}$/u, `${filename}:${jobName} action must be GitHub-owned and SHA-pinned: ${step.uses}`)
      }
      if (step.uses?.startsWith('actions/checkout@')) {
        assert.equal(step.with?.['persist-credentials'], false, `${filename}:${jobName} checkout must not persist credentials`)
      }
    }

    if (filename !== 'release.yml') {
      assert(!jobText.includes('${{ secrets.'), `${filename}:${jobName} must not consume release secrets`)
    }
  }
  workflows.set(filename, workflow)
}

const release = workflows.get('release.yml')
assert(release !== undefined, 'release.yml is required')
assert.equal(release.concurrency?.['cancel-in-progress'], false, 'an active release must never be canceled by a second run')
assert.deepEqual(release.jobs.publish.permissions, { contents: 'write' }, 'only publish may write release contents')
for (const [jobName, job] of Object.entries(release.jobs)) {
  if (jobName !== 'publish') assert.notEqual(job.permissions?.contents, 'write', `${jobName} must not write repository contents`)
}

for (const jobName of ['macos', 'windows', 'publish']) {
  assert.equal(release.jobs[jobName].environment, 'release', `${jobName} must use the protected release environment`)
}

const secretSteps = job => (job.steps ?? []).filter(step => JSON.stringify(step).includes('${{ secrets.'))
assert.deepEqual(secretSteps(release.jobs.macos).map(step => step.name), ['Package, sign, and notarize macOS app'])
assert.deepEqual(secretSteps(release.jobs.windows).map(step => step.name), ['Package Windows installer'])
for (const jobName of ['validate', 'linux', 'assemble', 'attest', 'publish']) {
  assert.equal(secretSteps(release.jobs[jobName]).length, 0, `${jobName} must not receive signing secrets`)
}

const macSign = secretSteps(release.jobs.macos)[0]
assert.match(macSign.run, /trap cleanup_apple_key EXIT/u, 'temporary Apple key must be removed on every exit path')
assert.match(macSign.run, /forceCodeSigning=true/u, 'macOS signing must fail closed')
assert.match(macSign.run, /TeamIdentifier/u, 'macOS signer team must be verified')
const macVerify = release.jobs.macos.steps.find(step => step.name === 'Verify Gatekeeper and notarization ticket')
assert.match(macVerify?.run ?? '', /flags=.*runtime/u, 'macOS hardened runtime must be verified on the signed app')

const windowsSign = secretSteps(release.jobs.windows)[0]
assert.match(windowsSign.run, /hasCertificate -ne \$hasPassword/u, 'partial Windows signing configuration must fail closed')
assert.match(windowsSign.run, /forceCodeSigning=true/u, 'configured Windows signing must fail closed')
assert.match(windowsSign.run, /Publishing an unsigned Windows installer/u, 'unsigned Windows publishing must be explicit')
assert.match(windowsSign.run, /signature.Status -ne 'NotSigned'/u, 'unsigned Windows output must be verified as unsigned')

const macUpload = release.jobs.macos.steps.find(step => step.name === 'Upload macOS release candidates')
assert(macUpload !== undefined, 'macOS candidate upload step is required')
assert(String(macUpload.with.path).includes('*.zip.blockmap'), 'macOS ZIP blockmaps must be retained for differential updates')
assert(!String(macUpload.with.path).includes('*.dmg.blockmap'), 'DMG blockmaps must not be published')
assert(!/^\s*apps\/desktop\/release\/\*\.blockmap\s*$/mu.test(String(macUpload.with.path)), 'macOS blockmap upload must not use a broad wildcard')

const linuxUpload = release.jobs.linux.steps.find(step => step.name === 'Upload Linux release candidates')
assert(linuxUpload !== undefined, 'Linux candidate upload step is required')
assert(!String(linuxUpload.with.path).includes('*.AppImage.blockmap'), 'unused AppImage blockmaps must not be published')

assert.deepEqual(release.jobs.assemble.permissions, { contents: 'read' }, 'assemble must not receive write or OIDC permissions')
assert(release.jobs.assemble.steps.some(step => String(step.run).includes('check-release-artifacts.mjs')), 'assembled release must enforce the asset allowlist')

assert.deepEqual(release.jobs.attest.permissions, { contents: 'read', 'id-token': 'write', attestations: 'write' })
assert.equal(release.jobs.attest.steps.some(step => step.uses?.startsWith('actions/checkout@')), false, 'attest must run without repository checkout')
assert.equal(release.jobs.attest.steps.some(step => /\byarn\b|\bnpm\b|\bnode\b/u.test(String(step.run ?? ''))), false, 'attest must not execute repository dependencies')
const attestStep = release.jobs.attest.steps.find(step => step.uses?.startsWith('actions/attest@'))
assert(attestStep !== undefined, 'release bundle must receive provenance attestation')
assert.equal(attestStep.with?.['subject-checksums'], 'release-ready/SHA256SUMS', 'attestation subjects must come from the verified checksum manifest')

assert.equal(release.jobs.publish.steps.some(step => step.uses?.startsWith('actions/checkout@')), false, 'publish must run on a fresh runner without repository checkout')
assert.equal(release.jobs.publish.steps.some(step => /\byarn\b|\bnpm\b|\bnode\b/u.test(String(step.run ?? ''))), false, 'publish must not execute repository dependencies')
const tokenSteps = release.jobs.publish.steps.filter(step => JSON.stringify(step.env ?? {}).includes('${{ github.token }}'))
assert.deepEqual(tokenSteps.map(step => step.name), ['Create or update draft release', 'Verify published bytes and make release public'])
for (const step of tokenSteps) {
  assert.equal(step.env?.GH_REPO, '${{ github.repository }}', `${step.name} must select the repository without relying on a checkout`)
}

console.log(`verified security invariants for ${workflowFiles.length} workflows`)
