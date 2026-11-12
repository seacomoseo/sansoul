import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { captureGolden } from '../golden/scenario.js'

// A 14.3.x commerce.yml (3DNAU's shape) must produce byte-identical notices,
// confirmations and invoice PDFs on every later engine.
test('golden: 3DNAU-shaped configuration sends exactly what 14.3.3 sent', async () => {
  const expected = JSON.parse(readFileSync(new URL('../golden/3dnau-14.3.3.json', import.meta.url), 'utf8'))
  const actual = await captureGolden()
  for (const scenario of Object.keys(expected)) {
    assert.equal(actual[scenario].length, expected[scenario].length, scenario)
    actual[scenario].forEach((message, index) => assert.equal(message, expected[scenario][index], `${scenario}[${index}]`))
  }
})
