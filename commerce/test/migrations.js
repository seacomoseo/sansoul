import { readdirSync } from 'node:fs'

// Every commerce migration in apply order, so tests never lag behind a new file.
export const MIGRATIONS = readdirSync(new URL('../migrations/', import.meta.url))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort()
