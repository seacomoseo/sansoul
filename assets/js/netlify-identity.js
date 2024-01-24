export function initNetlifyIdentity () {
  // Wen load if URL there is hash with token
  if (window.location.hash.includes('_token=')) {
    window.location.href = window.location.origin + '/admin/' + window.location.hash
  }
}
