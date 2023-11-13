// NETLIFY IDENTITY

// Wen load if URL there is hash with token
if (window.location.hash.indexOf('_token=') >= 0) {
  window.location.href = window.location.origin + '/admin/' + window.location.hash
}
