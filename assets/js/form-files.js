import { formErrorFileOnload, timestamp } from '@params'
import { slugify } from './slugify'

const closeIcon = `<svg class="close" onclick="closePreview(this)">
  <use href="/draws.${timestamp}.svg#xmark"></use>
</svg>`

export function initFormFiles () {
  window.addEventListener('load', () => {
    const forms = document.querySelectorAll('.form:has(input[type="file"])')
    forms.forEach(form => {
      form.querySelectorAll('input[type="file"]').forEach(input => {
        input.addEventListener('change', e => {
          const inputEl = e.target
          const files = [...inputEl.files]
          // Assigns length to the dataset for show_if
          inputEl.dataset.length =
            files.length || inputEl.closest('.form__item').querySelector('.form__preview-item:not([style]) input')
              ? 1
              : ''
          // Resets the input value
          inputEl.value = ''
          if (files.length) {
            const inputPreview = inputEl.closest('.form__item').querySelector('.form__preview')
            // Clears the previous preview
            // inputPreview.innerHTML = ''
            // Creates a placeholder for each file in order
            const placeholders = files.map(() => {
              const li = document.createElement('li')
              li.classList.add('form__preview-item')
              inputPreview.appendChild(li)
              return li
            })
            // Processes each file
            files.forEach((file, i) => {
              const reader = new FileReader()
              reader.onloadend = async () => {
                if (reader.error) {
                  placeholders[i].innerHTML = `<i class="form__preview-name">${formErrorFileOnload}:<br>${reader.error}</i>${closeIcon}`
                } else {
                  await formFile({ form, file, reader, input: inputEl, i, length: files.length, placeholder: placeholders[i] })
                }
              }
              reader.readAsDataURL(file)
            })
          }
        })
      })
    })

    // Function to close preview
    const closePreview = item => {
      const input = item.closest('.form__item').querySelector('.form__file input')
      item.parentElement.remove()
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }
    window.closePreview = closePreview
  })
}

async function formFile ({ form, file, reader, input, i, length, placeholder }) {
  let base64File = reader.result
  let compressedFile = file
  let previewMedia
  let fileName = file.name
  const isImage = base64File.startsWith('data:image')
  const isSVG = base64File.startsWith('data:image/svg')

  // If it is an image (and not SVG), compress it and update the file if needed
  if (isImage && !isSVG) {
    base64File = await new Promise((resolve, reject) => {
      const img = new Image()
      img.src = base64File
      img.onload = () => {
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
        const canvas = document.createElement('canvas')
        canvas.width = targetWidth
        canvas.height = targetHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight)
        canvas.toBlob(blob => {
          if (blob) {
            // If the blob is smaller than the original file, update the variables
            if (blob.size < file.size) {
              fileName = file.name.replace(/^(.+)\..+$/, '$1.webp')
              compressedFile = new File([blob], fileName, { type: compressedFile.type })
            }
            const blobReader = new FileReader()
            blobReader.onloadend = () => resolve(blobReader.result)
            blobReader.readAsDataURL(blob)
          } else {
            reject(new Error('Error converting canvas to blob'))
          }
        }, 'image/webp', 0.7)
      }
      img.onerror = err => reject(err)
    })
  }

  // Configure the preview media depending on whether it is an image or not
  if (isImage) {
    const blobUrl = URL.createObjectURL(compressedFile)
    const previewImg = new Image()
    previewImg.src = blobUrl
    previewImg.classList.add('form__preview-image')
    previewMedia = previewImg
  } else {
    previewMedia = document.createElement('strong')
    previewMedia.classList.add('form__preview-file')
    previewMedia.textContent = file.name.replace(/^.+\.(.+)$/, '$1')
  }

  // Create a hidden file input to hold the file for submission
  const fileInput = document.createElement('input')
  fileInput.name = input.name
  fileInput.placeholder = input.dataset.placeholder
  fileInput.dataset.basename = input.dataset.basename
  fileInput.dataset.size = compressedFile.size
  fileInput.dataset.ext = compressedFile.name.replace(/^.+(\..+)$/, '$1')
  fileInput.classList.add('display-none')

  console.log(base64File)

  if (form.dataset.prov === 'gas') {
    fileInput.type = 'text'
    fileInput.value = base64File
  } else {
    fileInput.type = 'file'
    // Use DataTransfer to assign the file to the file input
    const dt = new DataTransfer()
    dt.items.add(compressedFile)
    fileInput.files = dt.files
  }

  // Update the placeholder with the file information
  placeholder.innerHTML = `
    <i class="form__preview-media">${previewMedia.outerHTML}</i>
    <i class="form__preview-name">${fileName}</i>
    <i class="form__preview-size">${(compressedFile.size / 1000000).toLocaleString('es')} MB</i>
    ${closeIcon}
  `
  placeholder.appendChild(fileInput)

  return base64File
}

export function newFileNames (form, input, i, length, now) {
  const fileName = []
  const baseName = input.dataset.basename
  const baseInput = form.querySelector(`[name="${baseName}"]`)
  if (baseInput) fileName.push(baseInput.value || baseName)
  fileName.push(now.replace(/ |:/g, '-'))
  fileName.push(input.name)
  if (length > 1) fileName.push(i + 1)
  const newFileName = slugify(fileName.join('-')) + input.dataset.ext

  if (input.type === 'file') {
    // Change filename
    const file = input.files[0]
    const newFile = new File([file], newFileName, { type: file.type })
    // Use DataTransfer to assign the new file to the file input
    const dt = new DataTransfer()
    dt.items.add(newFile)
    input.files = dt.files
  } else if (input.type === 'text') {
    // Add filename and lastModified
    input.type = 'hidden'
    input.value = input.value + '|' + newFileName
  }
}
