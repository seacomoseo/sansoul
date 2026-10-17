import { loadResource } from './load-resource'

export function loadStyle (url) {
  return loadResource(url, 'style')
}
