// Compatibility entry point; both development modes use the prebuild supervisor.
const mode = process.argv[2]
if (!['dev', 'live', 'cms'].includes(mode)) throw new Error(`Unknown development mode: '${mode || ''}'`)
await import('./local-server.js')
