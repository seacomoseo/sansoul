import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { compileStructuralDraft } from '../structural-preview-prototype.js'

test('structural prototype rejects unbounded paths, oversized drafts and symlink targets', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-structural-security-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  for (const target of ['../secret.md', 'content/page/../../hugo.yml', '/tmp/draft.md', 'content/page/nested/file.es.md', 'data/config.yml']) {
    await assert.rejects(compileStructuralDraft({ project: root, target, markdown: '' }), /Target must/)
  }
  await assert.rejects(compileStructuralDraft({ project: root, target: 'content/page/a.es.md', markdown: 'x'.repeat(1000001) }), /1 MB/)
  await fs.mkdir(path.join(root, 'content'))
  await fs.symlink(os.tmpdir(), path.join(root, 'content/page'))
  await assert.rejects(compileStructuralDraft({ project: root, target: 'content/page/a.es.md', markdown: '' }), /symbolic links/)
})

test('failed compilation and pre-cancelled requests clean temporary workspaces', async t => {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-structural-failure-'))
  t.after(() => fs.rm(project, { recursive: true, force: true }))
  await fs.mkdir(path.join(project, 'core'))
  await fs.writeFile(path.join(project, 'core/do'), '#!/bin/sh\nexit 7\n')
  const before = (await fs.readdir(os.tmpdir())).filter(name => name.startsWith('sansoul-structural-preview-')).sort()
  const request = { project, target: 'content/page/new.es.md', markdown: '---\ntitle: Draft\n---\n' }
  await assert.rejects(compileStructuralDraft(request), /failed \(7\)/)
  await assert.rejects(compileStructuralDraft({ ...request, signal: AbortSignal.abort() }), /abort/i)
  assert.deepEqual((await fs.readdir(os.tmpdir())).filter(name => name.startsWith('sansoul-structural-preview-')).sort(), before)
  await assert.rejects(fs.stat(path.join(project, request.target)), { code: 'ENOENT' })
})

test('real consumer drafts compile text, conditions, get/remap and new-page structure without source writes', { skip: !process.env.SANSOUL_STRUCTURAL_PROJECT }, async () => {
  const project = path.resolve(process.env.SANSOUL_STRUCTURAL_PROJECT)
  const target = 'content/single/structural-prototype.es.md'
  const original = await fs.readFile(path.join(project, 'content/single/_home.es.md'))
  const initialTemps = (await fs.readdir(os.tmpdir())).filter(name => name.startsWith('sansoul-structural-preview-')).sort()
  const drafts = [
    ['Text draft', false, false],
    ['Conditional draft', true, false],
    ['Own template draft', true, true]
  ]
  for (const [title, enabled, extra] of drafts) {
    const markdown = `---
title: ${title}
url: /structural-prototype/
prototype_enabled: ${enabled}
prototype_copy: Lookup and remap draft
tpl:
  sections:
  - boxes:
    - title: ${title}
    - if: prototype_enabled
      get:
      - from: prototype_copy
        to: title
      remap:
      - from: title
        to: md
        copy: true
${extra ? '    - title: New own-template box\n' : ''}---
Unsaved body.
`
    const result = await compileStructuralDraft({ project, target, markdown })
    const html = result.files.get('structural-prototype/index.html').toString()
    assert.ok(html.includes(title))
    assert.equal(html.includes('Lookup and remap draft'), enabled)
    assert.equal(html.includes('New own-template box'), extra)
    if (enabled) assert.match(html, /<p>Lookup and remap draft<\/p>/)
    console.log(JSON.stringify({ title, files: result.files.size, copiedMs: Math.round(result.copiedMs), totalMs: Math.round(result.totalMs) }))
  }
  assert.deepEqual(await fs.readFile(path.join(project, 'content/single/_home.es.md')), original)
  await assert.rejects(fs.stat(path.join(project, target)), { code: 'ENOENT' })
  assert.deepEqual((await fs.readdir(os.tmpdir())).filter(name => name.startsWith('sansoul-structural-preview-')).sort(), initialTemps)
})
