const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
).replace(/\/+$/, '')

// Allow long-running document conversions.
const REQUEST_TIMEOUT = 600000

export function convertDocument(
  file,
  targetFormat,
  onProgress,
  options = {}
) {
  return new Promise((resolve, reject) => {
    const formData = new FormData()

    formData.append('file', file)
    formData.append('target_format', targetFormat)

    // PDF -> DOCX supports two conversion modes.
    const isPdfToDocx =
      file.name.toLowerCase().endsWith('.pdf') &&
      targetFormat.toLowerCase() === 'docx'

    if (isPdfToDocx) {
      formData.append(
        'pdf_mode',
        options.pdfMode || 'editable'
      )
    }

    const xhr = new XMLHttpRequest()

    xhr.open(
      'POST',
      `${API_BASE_URL}/api/convert`
    )

    xhr.responseType = 'blob'
    xhr.timeout = REQUEST_TIMEOUT

    // Actual upload progress.
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round(
          (event.loaded / event.total) * 100
        )

        onProgress?.({
          stage: 'uploading',
          progress: percent
        })
      }
    }

    // Upload is complete. Backend conversion begins.
    xhr.upload.onload = () => {
      onProgress?.({
        stage: 'converting',
        progress: 100
      })
    }

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (!xhr.response || xhr.response.size === 0) {
          reject(
            new Error('Server mengirim file hasil yang kosong.')
          )
          return
        }

        resolve(xhr.response)
        return
      }

      let message = 'Konversi dokumen gagal.'

      try {
        const responseText = await xhr.response.text()
        const errorData = JSON.parse(responseText)

        message = errorData.detail || message
      } catch {
        // Keep default error message.
      }

      reject(new Error(message))
    }

    xhr.onerror = () => {
      reject(
        new Error('Tidak dapat terhubung ke SlamDoc API.')
      )
    }

    xhr.ontimeout = () => {
      reject(
        new Error(
          'Waktu konversi habis. Silakan coba kembali.'
        )
      )
    }

    xhr.onabort = () => {
      reject(
        new Error('Proses konversi dibatalkan.')
      )
    }

    xhr.send(formData)
  })
}