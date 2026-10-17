// Build an isolated static snapshot for testing the actual Sveltia Test backend.
// Usage: node core/scripts/tests/browser-preview-fixture.js /private/tmp/sansoul-preview-browser /path/to/consumer [--groups]
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const root = path.resolve(process.argv[3] || process.cwd())
const destination = path.resolve(process.argv[2] || '')
if (!destination.startsWith('/private/tmp/sansoul-preview-') || existsSync(destination)) throw new Error('Choose a new /private/tmp/sansoul-preview-* snapshot directory.')
const source = path.join(root, 'public')
const cms = readFileSync(path.join(source, 'admin/index.html'), 'utf8')
if (!readdirSync(path.join(source, 'js')).some(name => /^preview-receiver\.[a-f0-9]{12}\.js$/.test(name))) throw new Error('Compile the consumer with the current CMS preview integration first.')
const configHref = cms.match(/<link[^>]+href="([^"]+)"[^>]+rel="cms-config-url"/)?.[1] || cms.match(/<link[^>]+rel="cms-config-url"[^>]+href="([^"]+)"/)?.[1]
if (!configHref) throw new Error('Cannot find the generated CMS configuration URL.')
const configPath = path.join(source, new URL(configHref, 'http://localhost').pathname)
const parsed = spawnSync('ruby', ['--disable-gems', '-r', 'yaml', '-r', 'json', '-e', 'puts JSON.generate(YAML.safe_load(File.read(ARGV[0]), [], [], true))', configPath], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
if (parsed.status !== 0) throw new Error(parsed.error?.message || parsed.stderr || 'Cannot parse generated CMS configuration')
const config = JSON.parse(parsed.stdout)
config.backend = { name: 'test-repo' }
config.publish_mode = 'simple'
cpSync(source, destination, { recursive: true })
writeFileSync(path.join(destination, 'admin/preview-config.json'), JSON.stringify(config))
writeFileSync(path.join(destination, 'admin/index.html'), cms.replace(configHref, '/admin/preview-config.json').replace('</head>', '<link rel="cms-seed-url" href="/seed/manifest.json"></head>'))
const files = []
const collect = (directory, prefix = '') => {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    if (item.name === 'TODO.md') continue
    const relative = path.posix.join(prefix, item.name)
    if (item.isDirectory()) collect(path.join(directory, item.name), relative)
    else files.push(relative)
  }
}
collect(path.join(root, 'content'), 'content')
collect(path.join(root, 'data'), 'data')
for (const file of ['uploads/base/poster.png', 'uploads/base/icon.png']) if (existsSync(path.join(root, file))) files.push(file)
for (const file of files) {
  const target = path.join(destination, 'seed', file)
  mkdirSync(path.dirname(target), { recursive: true })
  cpSync(path.join(root, file), target)
}
if (process.argv.includes('--groups')) {
  const fixture = 'content/single/cms-groups.es.md'
  mkdirSync(path.dirname(path.join(destination, 'seed', fixture)), { recursive: true })
  cpSync(new URL('./fixtures/cms-groups.es.md', import.meta.url), path.join(destination, 'seed', fixture))
  if (!files.includes(fixture)) files.push(fixture)
  // Only this isolated fixture observes the public formatter output. No private
  // CMS state or filesystem APIs are used by browser automation.
  const observer = `<script>
const registerFormat = window.CMS.registerCustomFormat.bind(window.CMS)
window.CMS.registerCustomFormat = (name, extension, codec) => registerFormat(name, extension, {
  ...codec,
  toFile(data) {
    const text = codec.toFile(data)
    let output = document.getElementById('fixture-saved-output')
    if (!output) { output = document.createElement('pre'); output.id = 'fixture-saved-output'; output.hidden = true; document.body.append(output) }
    output.textContent = JSON.stringify({ name, text })
    return text
  }
})
</script>`
  const indexPath = path.join(destination, 'admin/index.html')
  const index = readFileSync(indexPath, 'utf8')
  writeFileSync(indexPath, index.replace(/(<script src="https:\/\/unpkg.com\/@sveltia\/cms@[^"]+"><\/script>)/, '$1' + observer))
}
writeFileSync(path.join(destination, 'seed/manifest.json'), JSON.stringify({ files }))
console.log(`Snapshot ready: ${destination}\nServe it with python3 -m http.server 13143 --bind 127.0.0.1 --directory ${destination}\nOpen http://127.0.0.1:13143/admin/ and choose Start Demo.`)
