import { writeFileSync } from 'node:fs'
import { captureGolden } from './scenario.js'

// Run once on the reference engine (14.3.3): node commerce/test/golden/capture.js
const golden = await captureGolden()
writeFileSync(new URL('./3dnau-14.3.3.json', import.meta.url), JSON.stringify(golden, null, 1) + '\n')
console.log(Object.fromEntries(Object.entries(golden).map(([key, list]) => [key, list.length])))
