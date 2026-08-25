import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ['node_modules', '.yarn', 'lib', 'dist', 'release'].includes(entry.name)) {
      return []
    }
    const target = resolve(directory, entry.name)
    return entry.isDirectory() ? collect(target) : [target]
  })
}

const failures = []
const markdownFiles = collect(root).filter(filename => extname(filename) === '.md')

for (const filename of markdownFiles) {
  const source = readFileSync(filename, 'utf8')
  for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)) {
    const target = match[1]
    if (target === undefined || /^(?:https?:|mailto:|#)/u.test(target)) continue
    const relative = target.split('#', 1)[0]
    if (relative !== undefined && !existsSync(resolve(dirname(filename), relative))) {
      failures.push(`${filename}: unresolved link ${target}`)
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`DeepRunner docs: ${markdownFiles.length} Markdown files, all relative links resolve.\n`)
}
