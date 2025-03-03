export function initNetlifyIdentity () {
  // Wen load if URL there is hash with token
  if (location.hash.includes('_token=')) {
    location.href = location.origin + '/admin/' + location.hash
  }
}
