import { loadResource } from './load-resource'

export function loadScript (url) {
  return loadResource(url, 'script')
}
