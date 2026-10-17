/*
Purpose: Resolve the executing engine independently of its consumer layout.
Run from: A consumer root; supports core and the legacy themes/sansoul path.
Side effects: None.
*/
import { statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const engineDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const supportedEnginePaths = ['core', 'themes/sansoul']

export function relativeEnginePath (projectDir, directory = engineDir) {
  const relative = path.relative(path.resolve(projectDir), path.resolve(directory)).split(path.sep).join('/')
  if (!supportedEnginePaths.includes(relative)) {
    throw new Error(`SanSoul must be installed at core or themes/sansoul below ${projectDir}`)
  }
  return relative
}

export function findEnginePath (projectDir) {
  const relative = supportedEnginePaths.find(candidate => {
    try {
      return statSync(path.join(projectDir, candidate, 'do')).isFile()
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false
      throw error
    }
  })
  if (!relative) throw new Error(`SanSoul is not initialized below ${projectDir}`)
  return relative
}
