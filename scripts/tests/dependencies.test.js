import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { dependencyManager, checkDependencyManager, ensureRuntimeDependencies, installDependencies } from '../dependencies.js'

test('dependency manager selection preserves npm consumers and rejects ambiguity', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-manager-'))
  try {
    fs.writeFileSync(path.join(directory, 'package.json'), '{}')
    assert.equal(dependencyManager(directory).name, 'npm')
    fs.writeFileSync(path.join(directory, 'pnpm-lock.yaml'), '')
    assert.throws(() => dependencyManager(directory), /Pin pnpm/)
    fs.writeFileSync(path.join(directory, 'package-lock.json'), '{}')
    assert.throws(() => dependencyManager(directory), /Two package-manager lockfiles/)
    fs.writeFileSync(path.join(directory, 'package.json'), '{"packageManager":"pnpm@10.28.2"}')
    assert.throws(() => dependencyManager(directory), /Two package-manager lockfiles/)
    fs.unlinkSync(path.join(directory, 'package-lock.json'))
    assert.equal(dependencyManager(directory).name, 'pnpm')
    fs.writeFileSync(path.join(directory, 'package.json'), '{"packageManager":"npm@10.9.8"}')
    assert.throws(() => dependencyManager(directory), /does not match/)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('installs stay frozen and project-local; a missing or mismatched manager fails', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-manager-'))
  const oldPath = process.env.PATH
  try {
    fs.mkdirSync(path.join(directory, 'bin'))
    fs.writeFileSync(path.join(directory, 'package.json'), '{"packageManager":"pnpm@10.28.2"}')
    fs.writeFileSync(path.join(directory, 'pnpm-lock.yaml'), '')
    const bin = path.join(directory, 'bin', 'pnpm')
    fs.writeFileSync(bin, '#!/bin/sh\nif [ "$1" = --version ]; then echo 10.28.2; else printf "%s\\n" "$@" > install-args; fi\n', { mode: 0o755 })
    process.env.PATH = path.join(directory, 'bin')
    installDependencies({ directory })
    assert.match(fs.readFileSync(path.join(directory, 'install-args'), 'utf8'), /--frozen-lockfile/)
    assert.match(fs.readFileSync(path.join(directory, 'install-args'), 'utf8'), /enable-global-virtual-store=false/)
    installDependencies({ directory, updateLockfile: true })
    assert.match(fs.readFileSync(path.join(directory, 'install-args'), 'utf8'), /--no-frozen-lockfile/)
    fs.unlinkSync(path.join(directory, 'pnpm-lock.yaml'))
    assert.throws(() => installDependencies({ directory }), /Missing pnpm-lock/)
    fs.writeFileSync(path.join(directory, 'pnpm-lock.yaml'), '')
    fs.writeFileSync(bin, '#!/bin/sh\necho 10.0.0\n', { mode: 0o755 })
    assert.throws(() => checkDependencyManager(directory), /Expected pnpm@10.28.2/)
    fs.unlinkSync(bin)
    assert.throws(() => checkDependencyManager(directory), /unavailable/)
  } finally {
    process.env.PATH = oldPath
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('sh do new installs missing runtime packages where Node will look for them', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-runtime-'))
  const quiet = () => {}
  try {
    const project = path.join(root, 'project')
    const engine = path.join(project, 'core')
    fs.mkdirSync(path.join(engine, 'scripts'), { recursive: true })
    fs.writeFileSync(path.join(project, 'package.json'), '{}')
    const pkg = 'sansoul-fixture-runtime-pkg'
    const installed = []
    const install = ({ directory }) => {
      installed.push(directory)
      fs.mkdirSync(path.join(directory, 'node_modules', pkg), { recursive: true })
      fs.writeFileSync(path.join(directory, 'node_modules', pkg, 'index.js'), '')
      fs.writeFileSync(path.join(directory, 'node_modules', pkg, 'package.json'), '{"main":"index.js"}')
    }
    // Consumer: dependencies belong to the project root.
    assert.equal(ensureRuntimeDependencies({ engineDir: engine, projectDir: project, packages: [pkg], install, log: quiet }), project)
    assert.equal(ensureRuntimeDependencies({ engineDir: engine, projectDir: project, packages: [pkg], install, log: quiet }), null)
    // Standalone engine clone, run from elsewhere: install in the engine.
    const clone = path.join(root, 'sansoul')
    fs.mkdirSync(path.join(clone, 'scripts'), { recursive: true })
    assert.equal(ensureRuntimeDependencies({ engineDir: clone, projectDir: root, packages: [pkg], install, log: quiet }), root === clone ? null : clone)
    assert.deepEqual(installed, [project, clone])
    // A failed install explains how to recover.
    const broken = path.join(root, 'broken')
    fs.mkdirSync(path.join(broken, 'scripts'), { recursive: true })
    assert.throws(
      () => ensureRuntimeDependencies({ engineDir: broken, projectDir: broken, packages: ['sansoul-missing-pkg'], install: () => { throw new Error('pnpm is unavailable.') }, log: quiet }),
      /pnpm is unavailable[\s\S]*pnpm install --frozen-lockfile/
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
