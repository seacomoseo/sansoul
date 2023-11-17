const deployStatus = document.querySelector('.deploy-status')
const rebuildButton = document.querySelector('.rebuild')
// Status Badge SVG URL
const projectId = '{{ site.Params.netlify_id | default `sansoul` }}'
const badgeUrl = `https://api.netlify.com/api/v1/badges/${projectId}/deploy-status`

// In main and preview branchs...
function checkDeploymentStatus() {
  // Main / production branch
  fetchDeploymentStatus(badgeUrl, true)

  {{ if site.Data.config.cms_editorial_workflow }}
    // Nav link
    const previewLink = document.querySelector('.CMS_Navbar_site-url')
    if (previewLink.href) {
      // Remove branch in subdomain
      if (previewLink.href.search('--') > -1) previewLink.href = previewLink.href.replace(/^https:\/\/[\w-]+?--/g, 'https://')
    }
  {{ end }}

  // Preview branch in workflow
  const workflowControls = document.querySelector('.CMS_EditorToolbar_workflow-controls > .CMS_Menu_root')
  if (workflowControls) {
    // Check deployment status
    const branch = 'cms/' + window.location.hash.split('collections/')[1].replace(/entries\/|\?.*/g, '')
    const badgeUrlPreview = badgeUrl + '?branch=' + branch
    fetchDeploymentStatus(badgeUrlPreview)
    // Add branch in subdomain
    previewLink.href = previewLink.href.replace('https://', 'https://' + branch.replaceAll('/', '-') + '--')
  }
}

// Function to get and check the status of the deployment
function fetchDeploymentStatus(badge, production) {
  fetch(badge)
    .then((response) => response.text())
    .then((svgText) => {
      // Create a temporary SVG element to analyze the background color
      const parser = new DOMParser()
      const svgDoc = parser.parseFromString(svgText, 'image/svg+xml')
      const background = svgDoc.querySelector('path:nth-child(4)').getAttribute('fill')

      if (production) {
        // Disable rebuild button if is production and building color
        if (background == '#F6E0A5') {
          rebuildButton.disabled = true
        } else {
          rebuildButton.disabled = false
        }
        // Change deploy status color
        deployStatus.style.backgroundColor = background
      } else {
        // Change preview deploy status color
        deployStatus.style.backgroundImage = `linear-gradient(90deg,  transparent 50%, ${background} 0)`
      }

      // Restart animation
      deployStatus.classList.remove('timer')
      deployStatus.classList.add('timer')
    })
    .catch((error) => {
      console.error('Error al obtener el estado del despliegue:', error)
    })
}

// Call the function every X seconds (e.g. every 30 seconds)
const interval = 5000 // 5 seconds
setInterval(checkDeploymentStatus, interval)

{{ with getenv "HUGO_BUILD_HOOK" }}
  rebuildButton.addEventListener('click', () => {
    // Make an HTTP POST request to the Netlify webhook
    fetch('{{ . }}', {
      method: 'POST'
    })
    .then(response => {
      if (response.status === 200) {
        console.log('Rebuild start')
        checkDeploymentStatus()
      } else {
        console.log('There was a problem starting the reconstruction')
      }
    })
  })
{{ end }}

CMS.registerEventListener({
  name: 'postSave',
  handler: entry => {
    checkDeploymentStatus()
  }
})