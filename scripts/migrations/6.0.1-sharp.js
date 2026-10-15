#!/usr/bin/env node

/*
Purpose: Synchronize the consumer's Sharp dependency with the theme requirement.
Run from: Consumer project root through `sh do update` after SanSoul 6.0.1.
Writes: Root package.json; package-lock.json is synchronized by `npm install`.
*/

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const projectDir = process.cwd()
const packageFile = path.join(projectDir, 'package.json')
const themePackageFile = path.join(projectDir, 'themes', 'sansoul', 'package.json')
const projectPackage = readJson(packageFile, 'project package.json')
const themePackage = readJson(themePackageFile, 'theme package.json')
const requiredVersion = themePackage.dependencies?.sharp

if (!requiredVersion) fail('The theme package does not declare its required Sharp version.')

const dependencyVersion = projectPackage.dependencies?.sharp
const developmentVersion = projectPackage.devDependencies?.sharp
const nextVersion = dependencyVersion
  ? dependencyVersion === '^0.33.5' ? requiredVersion : dependencyVersion
  : developmentVersion && developmentVersion !== '^0.33.5' ? developmentVersion : requiredVersion
const changed = nextVersion !== dependencyVersion || Boolean(developmentVersion)

if (!changed) {
  console.log(`Keeping the existing consumer Sharp dependency ${dependencyVersion}.`)
  process.exit()
}

projectPackage.dependencies ||= {}
projectPackage.dependencies.sharp = nextVersion
if (developmentVersion) {
  delete projectPackage.devDependencies.sharp
  if (Object.keys(projectPackage.devDependencies).length === 0) delete projectPackage.devDependencies
}

fs.writeFileSync(packageFile, `${JSON.stringify(projectPackage, null, 2)}\n`, 'utf8')
console.log(`Set consumer sharp to ${nextVersion} in dependencies.`)

function readJson (file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    fail(`Cannot read ${label}: ${error.message}`)
  }
}

function fail (message) {
  console.error(message)
  process.exit(2)
}
