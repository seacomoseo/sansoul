import assert from 'node:assert/strict'
import { test } from 'node:test'
import { composeCredentials } from '../scripts/gmail-credentials.js'

const grant = scopes => JSON.stringify({ account: 'sender@example.test', client_id: 'cid', client_secret: 'cs', refresh_token: 'rt', token: 'short-lived', scopes })
const full = ['https://www.googleapis.com/auth/gmail.send', 'openid', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/drive.file']

test('composes the secret map from grant files and reports without values', () => {
  const { json, report } = composeCredentials(['main=/grant.json'], { drive: true, read: () => grant(full) })
  assert.deepEqual(JSON.parse(json), { main: { account: 'sender@example.test', client_id: 'cid', client_secret: 'cs', refresh_token: 'rt' } })
  assert.equal(report.length, 1)
  assert.doesNotMatch(report[0], /cs|rt|short-lived/)
})

test('rejects grants without the required scopes or fields', () => {
  assert.throws(() => composeCredentials(['main=/g'], { drive: true, read: () => grant(full.slice(0, 3)) }), /drive\.file/)
  assert.throws(() => composeCredentials(['main=/g'], { read: () => grant(full.slice(1)) }), /gmail\.send/)
  assert.throws(() => composeCredentials(['main=/g'], { read: () => JSON.stringify({ account: 'a@b.test', scopes: full }) }), /client_id/)
  assert.throws(() => composeCredentials(['bad ref=/g'], { read: () => grant(full) }), /invalid argument/)
})
