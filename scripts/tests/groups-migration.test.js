import test from 'node:test'
import assert from 'node:assert/strict'
import { addCMSDependency } from '../migrations/8.0.0-cms-groups.js'

test('CMS dependency migration is idempotent and preserves project dependencies', () => {
  const source = JSON.stringify({ dependencies: { custom: '1' }, devDependencies: { tooling: '2' } })
  const result = addCMSDependency(source, '2.9.1')
  assert.deepEqual(JSON.parse(result), { dependencies: { custom: '1', yaml: '2.9.1' }, devDependencies: { tooling: '2' } })
  assert.equal(addCMSDependency(result, '2.9.1'), result)
  const custom = '{"dependencies":{"yaml":"^2.9.1"}}'
  assert.equal(addCMSDependency(custom, '2.9.1'), custom)
  assert.deepEqual(JSON.parse(addCMSDependency('{"devDependencies":{"yaml":"2.9.1"}}', '2.9.1')), { dependencies: { yaml: '2.9.1' } })
})
