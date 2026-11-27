import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { captureGolden } from '../golden/scenario.js'

const read = name => JSON.parse(readFileSync(new URL(`../golden/${name}`, import.meta.url), 'utf8'))

// A 14.3.x commerce.yml (3DNAU's shape) must produce byte-identical notices,
// confirmations and invoice PDFs on every later engine. Deliberate changes replace
// one scenario with a later capture: 14.29 attaches the credit note to the refund
// notice (3dnau-14.29.0.json, written by `node commerce/test/golden/capture.js 14.29.0 refunded`).
test('golden: 3DNAU-shaped configuration sends exactly what 14.3.3 sent (save deliberate changes)', async () => {
  const expected = { ...read('3dnau-14.3.3.json'), ...read('3dnau-14.29.0.json') }
  const actual = await captureGolden()
  for (const scenario of Object.keys(expected)) {
    assert.equal(actual[scenario].length, expected[scenario].length, scenario)
    actual[scenario].forEach((message, index) => assert.equal(message, expected[scenario][index], `${scenario}[${index}]`))
  }
})
