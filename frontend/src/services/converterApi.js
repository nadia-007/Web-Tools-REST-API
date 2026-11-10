const API_BASE_URL = 'http://127.0.0.1:8000'

export function convertDocument(file, targetFormat, onProgress) {
  return new Promise((resolve, reject) => {
    const formData = new FormData()

    formData.append('file', file)
    formData.append('target_format', targetFormat)

    const xhr = new XMLHttpRequest()

    xhr.open('POST', `${API_BASE_URL}/api/convert`)
    xhr.responseType = 'blob'
    xhr.timeout = 120000

    // Progress pengiriman file ke backend
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round(
          (event.loaded / event.total) * 95
        )

        onProgress?.(percent)
      }
    }

    // File selesai diunggah, backend memproses konversi
    xhr.upload.onload = () => {
      onProgress?.(95)
    }

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100)
        resolve(xhr.response)
        return
      }

      let message = 'Konversi dokumen gagal.'

      try {
        const responseText = await xhr.response.text()
        const errorData = JSON.parse(responseText)
        message = errorData.detail || message
      } catch {
        // Gunakan pesan default
      }

      reject(new Error(message))
    }

    xhr.onerror = () => {
      reject(new Error(
        'Tidak dapat terhubung ke SlamDoc API.'
      ))
    }

    xhr.ontimeout = () => {
      reject(new Error(
        'Waktu konversi habis. Silakan coba kembali.'
      ))
    }

    xhr.send(formData)
  })
}