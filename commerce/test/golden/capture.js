import { writeFileSync } from 'node:fs'
import { captureGolden } from './scenario.js'

// Reference engine 14.3.3: node commerce/test/golden/capture.js
// A deliberate change of some scenarios: node commerce/test/golden/capture.js <version> <scenario>...
const [version = '14.3.3', ...only] = process.argv.slice(2)
const all = await captureGolden()
const golden = only.length ? Object.fromEntries(only.map(key => [key, all[key]])) : all
writeFileSync(new URL(`./3dnau-${version}.json`, import.meta.url), JSON.stringify(golden, null, 1) + '\n')
console.log(Object.fromEntries(Object.entries(golden).map(([key, list]) => [key, list.length])))
