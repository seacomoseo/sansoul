import { name, netlify, netlifyHook, netlifyId, cloudflareId } from '@params'

const deployStatus = document.querySelector('.deploy-status')
const deployTime = document.querySelector('.deploy-time')
const rebuildButton = document.querySelector('.rebuild')

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
async function checkDeploymentStatus () {
  if (netlify) {
    statusColor = await getStatusColorNetlify(`https://api.netlify.com/api/v1/badges/${netlifyId}/deploy-status`)
  } else {
    statusColor = await getStatusColorCloudflare(`https://deploy-status.sansoul.workers.dev/?name=${name}&id=${atob(cloudflareId)}`)
  }
  console.log('color:', statusColor)
  const isBuilding = statusColor === '#F6E0A5'
  // Disable rebuild button if is building color
  rebuildButton.disabled = isBuilding
  // Change deploy status color
  deployStatus.style.backgroundColor = statusColor
  // Restart animation
  deployStatus.classList.remove('timer')
  deployStatus.classList.add('timer')
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
      return 'red'
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
      return 'red'
    })
}

if (deployStatus && rebuildButton) {
  checkDeploymentStatus()
  // Call the function every 5 seconds
  setInterval(checkDeploymentStatus, 5000)

  rebuildButton.addEventListener('click', () => {
    rebuildButton.disabled = true
    deployStatus.style.backgroundColor = '#F6E0A5'
    if (netlify) {
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
            checkDeploymentStatus()
          })
          .catch(error => {
            console.error(`Error deployment: ${error}`)
          })
      }
    } else {
      fetch(`https://deploy.sansoul.workers.dev/?name=${name}&id=${atob(cloudflareId)}`)
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP status ${response.status}`)
          }
          return response.text()
        })
        .then(data => {
          console.log("Rebuild start")
          checkDeploymentStatus()
        })
        .catch(error => {
          console.error(`Error deployment: ${error}`)
        })
      checkDeploymentStatus()
    }
  })
}
