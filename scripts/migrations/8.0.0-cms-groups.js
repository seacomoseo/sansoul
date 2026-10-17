#!/usr/bin/env node
/*
Purpose: Add the YAML runtime dependency required by the CMS group adapter.
Run from: Consumer root through the updater; --check reports without writing.
Writes: Root package.json only. The updater installs with the declared manager.
*/
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { engineDir } from '../engine-paths.js'

export function addCMSDependency (source, version) {
  const pkg = JSON.parse(source)
  if (pkg.dependencies?.yaml) return source
  pkg.dependencies ||= {}
  pkg.dependencies.yaml = pkg.devDependencies?.yaml || version
  if (pkg.devDependencies?.yaml) {
    delete pkg.devDependencies.yaml
    if (!Object.keys(pkg.devDependencies).length) delete pkg.devDependencies
  }
  return `${JSON.stringify(pkg, null, 2)}\n`
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Usage: 8.0.0-cms-groups.js [--check]')
  const file = path.join(process.cwd(), 'package.json')
  const source = fs.readFileSync(file, 'utf8')
  const version = JSON.parse(fs.readFileSync(path.join(engineDir, 'package.json'), 'utf8')).dependencies.yaml
  if (!version) throw new Error('SanSoul must declare its YAML dependency')
  const result = addCMSDependency(source, version)
  if (result !== source && !process.argv.includes('--check')) fs.writeFileSync(file, result)
  console.log(result === source ? 'CMS YAML dependency already available.' : `${process.argv.includes('--check') ? 'Would add' : 'Added'} CMS YAML dependency; synchronize the lockfile with the declared manager.`)
}
