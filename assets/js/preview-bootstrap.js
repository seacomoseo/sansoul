import { PREVIEW_TOKEN_PARAM } from './cms/live-preview-protocol'

// Keep normal public visits outside the full CMS receiver module graph.
// The receiver independently verifies the exact CMS grandparent and token.
export function loadPreviewReceiver (targetWindow = window) {
  if (targetWindow.parent === targetWindow || targetWindow.__sansoulPreviewLoading || targetWindow.__sansoulPreviewReceiver) return
  const token = new URLSearchParams(targetWindow.location.search).get(PREVIEW_TOKEN_PARAM)
  if (!/^[a-f0-9-]{36}$/i.test(token || '')) return
  const document = targetWindow.document
  const source = document.currentScript?.dataset.sansoulPreviewReceiver
  if (!source) return
  let url
  try { url = new URL(source, targetWindow.location.href) } catch { return }
  if (url.origin !== targetWindow.location.origin) return
  targetWindow.__sansoulPreviewLoading = true
  const script = document.createElement('script')
  script.src = url.href
  script.defer = true
  script.onerror = () => {
    targetWindow.__sansoulPreviewLoading = false
    console.warn('SanSoul could not load the experimental preview receiver.')
  }
  document.head.append(script)
}

if (typeof window !== 'undefined') loadPreviewReceiver()
