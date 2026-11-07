import { scrollShot } from './scroll-shot'
import { reducedMotion, onMotionChange } from './motion'

let initialized = false

export function initCounter () {
  const elements = document.querySelectorAll('.counter')
  if (initialized || !elements.length) return
  initialized = true

  const states = new Map([...elements].map(element => [element, {
    text: element.textContent,
    value: parseInt(element.textContent.replace('.', ''), 10),
    timer: undefined,
    generation: 0
  }]))
  const animationDuration = 2000
  const frameDuration = 1000 / 60
  const totalFrames = Math.round(animationDuration / frameDuration)
  const easeOutQuad = t => t * (2 - t)

  function finish (element, state) {
    clearInterval(state.timer)
    state.generation++
    state.timer = undefined
    element.textContent = state.text
  }

  onMotionChange(reduce => {
    if (reduce) states.forEach((state, element) => finish(element, state))
  })

  function animateCountUp (element) {
    const state = states.get(element)
    if (!state) return
    if (reducedMotion()) return finish(element, state)
    clearInterval(state.timer)
    const generation = ++state.generation
    let frame = 0
    state.timer = setInterval(() => {
      // A queued callback must not rewrite the final value after cancellation.
      if (generation !== state.generation) return
      if (reducedMotion()) return finish(element, state)
      frame++
      const currentCount = Math.round(state.value * easeOutQuad(frame / totalFrames))
      element.textContent = currentCount.toLocaleString('es-ES')
      if (frame === totalFrames) {
        clearInterval(state.timer)
        state.timer = undefined
      }
    }, frameDuration)
  }

  scrollShot({ rootMargin: '0%', query: '.counter', doStart: animateCountUp })
}
