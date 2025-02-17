import {
  formErrorFileOnload,
  timestamp
} from '@params'

const closeIcon =
`<svg class="close" onclick="closePreview(this)">
  <use href="/draws.${timestamp}.svg#xmark"></use>
</svg>`

export function initFormFiles () {
  window.addEventListener('load', () => {
    // Only forms with file inputs
    const forms = document.querySelectorAll('.form:has(input[type="file"])')
    forms.forEach(form => {
      // On change input files
      form.querySelectorAll('input[type="file"]').forEach(input => {
        input.addEventListener('change', e => {
          const input = e.target
          const files = [...input.files]
          // Length to dataset for show_if
          input.dataset.length = files.length || input.closest('.form__item').querySelector('.form__preview-item:not([style]) input') ? 1 : ''
          // Reset
          input.value = ''
          if (files.length) {
            const inputPreview = input.closest('.form__item').querySelector('.form__preview')
            files.forEach(file => {
              const reader = new FileReader()
              // When reading finishes
              reader.onloadend = async () => {
                // If an error occurred, reader.error will defined
                if (reader.error) {
                  inputPreview.innerHTML += `
                    <li class="form__preview-item form__preview-item--error-load">
                      <i class="form__preview-name">${formErrorFileOnload}:<br>${reader.error}</i>
                      ${closeIcon}
                    </li>
                  `
                } else {
                  await formFile({ form, file, reader, inputPreview, input })
                }
              }
              reader.readAsDataURL(file)
            })
          }
        })
      })
    })

    // For show_if
    function closePreview (item) {
      const input = item.closest('.form__item').querySelector('.form__file input')
      item.parentElement.remove()
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }
    window.closePreview = closePreview
  })
}

async function formFile ({ form, file, reader, inputPreview, input }) {
  let base64File = reader.result
  let compressedFile = file
  let previewMedia
  let fileName = file.name
  const isImage = base64File.startsWith('data:image')
  const isSVG = base64File.startsWith('data:image/svg')

  // Change base64File value and compressedFile to image if is it
  if (isImage && !isSVG) {
    base64File = await new Promise((resolve, reject) => {
      const img = new Image()
      img.src = base64File
      img.onload = () => {
        // Calculate target dimensions preserving aspect ratio (max 1920x1920)
        const originalWidth = img.naturalWidth
        const originalHeight = img.naturalHeight
        const maxDimension = 1920
        let targetWidth = originalWidth
        let targetHeight = originalHeight

        if (originalWidth > maxDimension || originalHeight > maxDimension) {
          const ratio = Math.min(maxDimension / originalWidth, maxDimension / originalHeight)
          targetWidth = originalWidth * ratio
          targetHeight = originalHeight * ratio
        }

        // Create canvas and draw the resized image
        const canvas = document.createElement('canvas')
        canvas.width = targetWidth
        canvas.height = targetHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

        // Convert canvas content to a compressed image
        canvas.toBlob(blob => {
          if (blob) {
            // If the blob is smaller than the original file, update compressedFile and base64File
            if (blob.size < file.size) {
              compressedFile = blob
              fileName = file.name.replace(/^(.+)\..+$/, '$1.webp')
              // const blobReader = new File([blob], file.name.replace(/^(.+)\..+$/, '$1.webp'), { type: 'image/webp', lastModified: new Date().getTime() })
              const blobReader = new FileReader()
              blobReader.onloadend = () => {
                resolve(blobReader.result)
              }
              blobReader.readAsDataURL(blob)
            }
          } else {
            reject(new Error('Error converting canvas to blob'))
          }
        }, 'image/webp', 0.7)
      }
      img.onerror = err => reject(err)
    })
  }

  // Set previewMedia
  if (isImage) {
    // Create a temporary URL for preview
    const blobUrl = URL.createObjectURL(compressedFile)
    const previewImg = new Image()
    previewImg.src = blobUrl
    previewMedia = previewImg
    previewMedia.classList.add('form__preview-image')
  } else {
    // For non-image files, just create a basic preview text
    previewMedia = document.createElement('strong')
    previewMedia.classList.add('form__preview-file')
    previewMedia.append(file.name.replace(/^.+\.(.+)$/, '$1'))
  }

  // Show Preview File
  // Now that the asynchronous operations are done, show the preview
  const fileInput = document.createElement('input')
  if (form.dataset.gas) {
    fileInput.type = 'text'
    fileInput.name = input.name
    fileInput.placeholder = input.dataset.placeholder
    fileInput.dataset.requiredif = input.dataset.requiredif
    fileInput.dataset.size = compressedFile.size
    fileInput.value = base64File
  } else {
    fileInput.attributes = input.attributes
    fileInput.files.push(compressedFile)
  }
  fileInput.classList.value = 'display-none'

  const li = document.createElement('li')
  li.classList.add('form__preview-item')
  li.innerHTML += `
    <i class="form__preview-media">${previewMedia.outerHTML}</i>
    <i class="form__preview-name">${fileName}</i>
    <i class="form__preview-size">${(compressedFile.size / 1000000).toLocaleString('es')} MB</i>
    ${closeIcon}
  `
  li.appendChild(fileInput)
  inputPreview.appendChild(li)

  return base64File
}
