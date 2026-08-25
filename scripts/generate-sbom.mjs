import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const desktop = JSON.parse(await readFile(resolve(root, 'apps/desktop/package.json'), 'utf8'))
const packages = Object.entries(desktop.dependencies).sort(([a], [b]) => a.localeCompare(b)).map(([name, version]) => ({ SPDXID: `SPDXRef-Package-${name.replace(/[^A-Za-z0-9.-]/gu, '-')}`, name, versionInfo: String(version), downloadLocation: 'NOASSERTION', filesAnalyzed: false, licenseConcluded: 'NOASSERTION', licenseDeclared: 'NOASSERTION', copyrightText: 'NOASSERTION' }))
const document = { spdxVersion: 'SPDX-2.3', dataLicense: 'CC0-1.0', SPDXID: 'SPDXRef-DOCUMENT', name: `DeepRunner-${desktop.version}`, documentNamespace: `https://github.com/zhigui/DeepRunner/releases/tag/v${desktop.version}/sbom`, creationInfo: { created: new Date().toISOString(), creators: ['Tool: DeepRunner scripts/generate-sbom.mjs'] }, packages }
const output = resolve(process.env.DEEPRUNNER_SBOM_PATH ?? resolve(root, 'release-artifacts/deeprunner.spdx.json'))
await writeFile(output, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
console.log(`created SPDX SBOM with ${packages.length} packages`)
