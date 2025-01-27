import { netlify, netlifyHook, netlifyId, cloudflareId, name } from '@params'

const deployStatus = document.querySelector('.deploy-status')
const rebuildButton = document.querySelector('.rebuild')

// Function to get and check the status of the deployment
async function checkDeploymentStatus () {
  let statusColor
  if (netlify) {
    statusColor = await getStatusColorNetlify(`https://api.netlify.com/api/v1/badges/${netlifyId}/deploy-status`)
  } else {
    statusColor = await getStatusColorCloudflare(`https://deploy-status.sansoul.workers.dev/?name=${name}&id=${atob(cloudflareId)}`)
  }
  // Disable rebuild button if is building color
  rebuildButton.disabled = statusColor === 'red'
  // Change deploy status color
  deployStatus.style.backgroundColor = statusColor
  // Restart animation
  deployStatus.classList.remove('timer')
  deployStatus.classList.add('timer')
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
  // Call the function every 5 seconds
  setInterval(checkDeploymentStatus, 5000)

  if (netlifyHook) {
    rebuildButton.addEventListener('click', () => {
      fetch(btoa('aHR0cHM6Ly9hcGkubmV0bGlmeS5jb20vYnVpbGRfaG9va3Mv' + netlifyHook), { method: 'POST' })
        .then(response => {
          if (response.status === 200) {
            console.log('Rebuild start')
            checkDeploymentStatus()
          } else {
            console.log('There was a problem starting the reconstruction')
          }
        })
    })
  }
}
