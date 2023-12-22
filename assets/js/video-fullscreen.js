
const videos = document.querySelectorAll('video')
videos.forEach(video => {
  video.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement) {
      video.style.objectFit = 'contain'
    } else {
      video.style.objectFit = ''
    }
  })
})
