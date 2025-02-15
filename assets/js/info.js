import { name, netlify, netlifyHook, netlifyId, cloudflareId } from '@params'

const deployStatus = document.getElementById('status')
const deployTime = document.getElementById('deploy-time')
const deployStatusButton = document.querySelector('#status > .button')
const rebuildButton = document.querySelector('.rebuild > *:nth-child(1)')
const clearCacheButton = document.querySelector('.rebuild > *:nth-child(2)')

let statusColor
let counter = 0
let isRunning = false
let counterInterval

const timer = isBuilding => {
  if (isBuilding) {
    if (!isRunning) {
      isRunning = true
      counterInterval = setInterval(() => {
        counter++
        deployTime.innerHTML = `${counter}s`
      }, 1000)
    }
  } else {
    isRunning = false
    counter = 0
    clearInterval(counterInterval)
  }
}

// Function to get and check the status of the deployment
async function checkStatus () {
  if (netlify && netlifyId) {
    statusColor = await getStatusColorNetlify(`https://api.netlify.com/api/v1/badges/${netlifyId}/deploy-status`)
  } else if (cloudflareId) {
    statusColor = await getStatusColorCloudflare(`https://deploy-status.sansoul.workers.dev/?name=${name}&id=${atob(cloudflareId)}`)
  }
  if (statusColor) {
    setStatus(statusColor)
  }
}

function setStatus (statusColor) {
  console.log('color: ', statusColor)
  const isBuilding = statusColor === '#F6E0A5'
  // Disable rebuild button if is building color
  if (rebuildButton) rebuildButton.disabled = isBuilding
  if (clearCacheButton) clearCacheButton.disabled = isBuilding
  // Change deploy status color
  deployStatusButton.style.setProperty('--similar', statusColor)
  timer(isBuilding)
}

function getStatusColorNetlify (url) {
  return fetch(url)
    .then(response => response.text())
    .then(svgText => {
      // Create a temporary SVG element to analyze the background color
      // eslint-disable-next-line
      const parser = new DOMParser()
      const svgDoc = parser.parseFromString(svgText, 'image/svg+xml')
      const background = svgDoc.querySelector('path:nth-child(4)').getAttribute('fill')
      return background
    })
    .catch(error => {
      console.error('Error obtaining deployment status:', error)
      return 'tomato'
    })
}

function getStatusColorCloudflare (url) {
  return fetch(url)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`)
      }
      return response.text()
    })
    .catch(error => {
      console.error('Error obtaining deployment status:', error)
      return 'tomato'
    })
}

if (deployStatus && rebuildButton) {
  checkStatus()
  // Call the function every 5 seconds
  setInterval(checkStatus, netlify ? 1000 : 5000)

  document.addEventListener('click', e => {
    const rebuildTarget = e.target.closest('.rebuild:not([disabled])')
    if (rebuildTarget) rebuild()
    const clearCacheTarget = e.target.closest('.clear-cache:not([disabled])')
    if (clearCacheTarget) rebuildCloudflare({ cache: true })
  })

  function rebuild () {
    setStatus('#F6E0A5')
    if (netlify && netlifyHook) {
      rebuildNetlify()
    } else if (cloudflareId) {
      rebuildCloudflare({ cache: false })
    }
  }

  function rebuildNetlify () {
    if (netlifyHook) {
      fetch(atob('aHR0cHM6Ly9hcGkubmV0bGlmeS5jb20vYnVpbGRfaG9va3Mv' + netlifyHook), { method: 'POST' })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP status ${response.status}`)
          }
          return response.json()
        })
        .then(data => {
          console.log(`Rebuild start: ${data}`)
          checkStatus()
        })
        .catch(error => {
          console.error(`Error deployment: ${error}`)
        })
    }
  }

  function rebuildCloudflare ({ cache }) {
    fetch(`https://deploy.sansoul.workers.dev/?name=${name}&id=${atob(cloudflareId)}&clearCache=${cache}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP status ${response.status}`)
        }
        return response.json()
      })
      .then(data => {
        console.log(cache ? 'Rebuild start: ' : 'Clear cache start: ', data)
        checkStatus()
      })
      .catch(error => {
        console.error(`Error deployment: ${error}`)
      })
    checkStatus()
  }
}
