import { formErrorFileOnload, timestamp } from '@params'

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
          // Asigna la longitud al dataset para show_if
          inputEl.dataset.length =
            files.length || inputEl.closest('.form__item').querySelector('.form__preview-item:not([style]) input')
              ? 1
              : ''
          // Resetea el valor del input
          inputEl.value = ''
          if (files.length) {
            const inputPreview = inputEl.closest('.form__item').querySelector('.form__preview')
            // Limpia la vista previa anterior
            inputPreview.innerHTML = ''
            // Crea un placeholder para cada archivo en orden
            const placeholders = files.map(() => {
              const li = document.createElement('li')
              li.classList.add('form__preview-item')
              inputPreview.appendChild(li)
              return li
            })
            // Procesa cada archivo
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

    // Función para cerrar la vista previa
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
  
  // Si es imagen (y no SVG), comprimirla y obtener el nuevo base64
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
            // Si el blob es más pequeño que el archivo original, se actualizan las variables
            if (blob.size < file.size) {
              compressedFile = blob
              fileName = file.name.replace(/^(.+)\..+$/, '$1.webp')
              const blobReader = new FileReader()
              blobReader.onloadend = () => {
                resolve(blobReader.result)
              }
              blobReader.readAsDataURL(blob)
            } else {
              resolve(base64File)
            }
          } else {
            reject(new Error('Error converting canvas to blob'))
          }
        }, 'image/webp', 0.7)
      }
      img.onerror = err => reject(err)
    })
  }
  
  // Configura la previsualización según si es imagen o no
  if (isImage) {
    const blobUrl = URL.createObjectURL(compressedFile)
    const previewImg = new Image()
    previewImg.src = blobUrl
    previewImg.classList.add('form__preview-image')
    previewMedia = previewImg
  } else {
    previewMedia = document.createElement('strong')
    previewMedia.classList.add('form__preview-file')
    previewMedia.append(file.name.replace(/^.+\.(.+)$/, '$1'))
  }
  
  // Crea el input oculto para enviar el archivo (o su representación en texto)
  const fileInput = document.createElement('input')
  if (form.dataset.gas) {
    fileInput.type = 'text'
    fileInput.name = input.name
    fileInput.placeholder = input.dataset.placeholder
    fileInput.dataset.basename = input.dataset.basename
    fileInput.dataset.size = compressedFile.size
    fileInput.value = base64File + '|' + driveFileName(fileInput, i, length)
  } else {
    // Nota: La propiedad files de un input es de solo lectura, por lo que si necesitas administrar
    // los archivos, se requiere otra estrategia.
    fileInput.attributes = input.attributes
  }
  fileInput.classList.add('display-none')
  
  // Actualiza el placeholder con la información del archivo
  placeholder.innerHTML = `
    <i class="form__preview-media">${previewMedia.outerHTML}</i>
    <i class="form__preview-name">${fileName}</i>
    <i class="form__preview-size">${(compressedFile.size / 1000000).toLocaleString('es')} MB</i>
    ${closeIcon}
  `
  placeholder.appendChild(fileInput)
  
  return base64File
}

function driveFileName (fileInput, i, length) {
  const name = []
  const baseName = fileInput.dataset.basename
  const baseInput = document.querySelector(`[name="${baseName}"], [name="📄${baseName}"]`)
  const now = new Date()
    .toLocaleString('sv-SE', { timeZone: 'Europe/Madrid', hour12: false })
    .replace(' ', '-')
    .replace(/:/g, '-')
  if (baseInput) name.push(baseInput.value || baseName)
  name.push(fileInput.name.replace('📄', ''))
  if (length > 1) name.push(i + 1)
  name.push(now)
  return name.join('-').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}
