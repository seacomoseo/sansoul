#!/usr/bin/env node

/*
Purpose: Materialize the nested prebuild config for the executing engine layout.
Run from: Consumer project root, through sh do prebuild.
Writes: Only the explicit temporary config destination supplied by the caller.
The main-build mounts stay project-relative; only nested-prebuild inputs use
absolute paths. The materialized config is never published with the website.
*/
import fs from 'node:fs'
import path from 'node:path'
import { engineDir, relativeEnginePath } from './engine-paths.js'

const projectDir = process.cwd()
const corePath = relativeEnginePath(projectDir)
const destination = process.argv[2]
if (!destination) throw new Error('Missing temporary prebuild configuration destination')
const source = fs.readFileSync(path.join(engineDir, 'prebuild', 'hugo.yml'), 'utf8')
const config = source.replace(/^(\s*- source: )(__SANSOUL_PROJECT__|__SANSOUL_CORE__)([^\r\n]*)$/gm,
  (_match, prefix, token, suffix) => prefix + JSON.stringify(
    token === '__SANSOUL_PROJECT__' ? projectDir + suffix : corePath + suffix
  ))
  .replaceAll('__SANSOUL_THEMES_DIR__', JSON.stringify(path.posix.dirname(corePath)))
  .replaceAll('__SANSOUL_THEME_NAME__', JSON.stringify(path.posix.basename(corePath)))
if (/__SANSOUL_[A-Z_]+__/.test(config)) throw new Error('Unresolved prebuild path token')
fs.writeFileSync(destination, config)
