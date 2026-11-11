import { useEffect, useRef, useState } from 'react'

import { convertDocument } from './services/converterApi'

import {
  playDing,
  playMiss,
  playSwish,
  playWhoosh,
  setMuted,
  unlockAudio
} from './services/soundEffects'


const CONVERSIONS = [
  { source: 'DOCX', target: 'PDF' },
  { source: 'PDF', target: 'DOCX' },
  { source: 'MD', target: 'HTML' },
  { source: 'HTML', target: 'MD' },
  { source: 'CSV', target: 'XLSX' },
  { source: 'XLSX', target: 'CSV' }
]

const MAX_FILE_SIZE = 15 * 1024 * 1024
const MIN_DRAG_DISTANCE = 12

const PROGRESS_STATUSES = [
  'uploading',
  'converting',
  'done',
  'error'
]

// Throw physics.
const GRAVITY = 3300
const LOB_HEIGHT_RATIO = 0.27
const MIN_LOB_HEIGHT = 90
const MISS_TIMEOUT = 0.6

const FLIGHT_SCALE_END = 0.5
const FLIGHT_TILT_START = -8
const FLIGHT_TILT_END = 14

const AIM_STEP = 1 / 120
const AIM_DOT_INTERVAL = 8

const CARD_DONE_VISIBLE_MS = 2600

const REST_TRANSFORM = 'translate3d(0, 0, 0)'
const MUTE_STORAGE_KEY = 'slamdoc-muted'


const readMutedPreference = () => {
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const formatElapsed = (seconds) => {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}


function App() {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [pdfMode, setPdfMode] = useState('editable')

  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)

  const [dragging, setDragging] = useState(false)
  const [draggingFile, setDraggingFile] = useState(false)
  const [isShooting, setIsShooting] = useState(false)

  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const [uploadedCount, setUploadedCount] = useState(0)
  const [cardDismissed, setCardDismissed] = useState(false)
  const [muted, setMutedState] = useState(readMutedPreference)

  const inputRef = useRef(null)
  const courtRef = useRef(null)
  const tokenRef = useRef(null)
  const hoopRef = useRef(null)
  const basketRef = useRef(null)
  const canvasRef = useRef(null)

  const pointerRef = useRef(null)
  const geometryRef = useRef(null)
  const aimPreviewRef = useRef(null)

  const canvasFrameRef = useRef(null)
  const projectileFrameRef = useRef(null)
  const shootingRef = useRef(false)

  const conversionStartedAtRef = useRef(null)

  const selected = CONVERSIONS[selectedIndex]

  const isBusy = loading || isShooting

  const isPdfToDocx =
    selected.source === 'PDF' &&
    selected.target === 'DOCX'

  const inProgress = PROGRESS_STATUSES.includes(status)

  const showCard = Boolean(file) && inProgress && !cardDismissed

  const hasDocument = Boolean(file) && !inProgress

  const fileSize = file
    ? file.size < 1024 * 1024
      ? `${(file.size / 1024).toFixed(1)} KB`
      : `${(file.size / (1024 * 1024)).toFixed(2)} MB`
    : ''

  const conversionDescription = status === 'converting'
    ? isPdfToDocx
      ? pdfMode === 'preserve_layout'
        ? 'Preserving original page layout...'
        : 'Building editable Word document...'
      : 'Processing document...'
    : ''


  // ==========================================================
  // FILE VALIDATION
  // ==========================================================

  const handleFile = (selectedFile) => {
    if (!selectedFile || isBusy) return

    const extension = selectedFile.name
      .split('.')
      .pop()
      .toLowerCase()

    const expected = selected.source.toLowerCase()

    const isValid =
      extension === expected ||
      (expected === 'html' && extension === 'htm')

    setError('')
    setResult(null)
    setProgress(0)
    setElapsedSeconds(0)

    aimPreviewRef.current = null

    if (!isValid) {
      setFile(null)
      setStatus('idle')
      setError(`Format file harus ${selected.source}.`)
      requestCanvasFrame()
      return
    }

    if (!selectedFile.size) {
      setFile(null)
      setStatus('idle')
      setError('File yang dipilih kosong.')
      return
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      setFile(null)
      setStatus('idle')
      setError('Ukuran file maksimal 15 MB.')
      return
    }

    if (tokenRef.current) {
      tokenRef.current
        .getAnimations()
        .forEach((animation) => animation.cancel())

      tokenRef.current.style.cssText = ''
    }

    setFile(selectedFile)
    setStatus('ready')

    basketRef.current?.classList.remove('net-scored')
  }


  // ==========================================================
  // PDF MODE SELECTION
  // ==========================================================

  const handlePdfModeChange = (mode) => {
    if (isBusy) return

    setPdfMode(mode)
    setError('')
    setResult(null)
  }


  // ==========================================================
  // FORMAT SELECTION
  // ==========================================================

  const handleFormatChange = (index) => {
    if (isBusy) return

    setSelectedIndex(index)
    setPdfMode('editable')

    setFile(null)
    setError('')
    setResult(null)

    setProgress(0)
    setElapsedSeconds(0)
    setStatus('idle')

    aimPreviewRef.current = null

    if (inputRef.current) {
      inputRef.current.value = ''
    }

    if (tokenRef.current) {
      tokenRef.current.style.cssText = ''
    }

    basketRef.current?.classList.remove('net-scored')

    requestCanvasFrame()
  }


  // ==========================================================
  // DOWNLOAD
  // ==========================================================

  const downloadFile = (blob, filename) => {
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')

    link.href = url
    link.download = filename

    document.body.appendChild(link)

    link.click()
    link.remove()

    window.setTimeout(() => {
      URL.revokeObjectURL(url)
    }, 30000)
  }


  // ==========================================================
  // REST API CONVERSION
  // ==========================================================

  const handleConvert = async () => {
    if (!file || loading) return

    setError('')
    setCardDismissed(false)

    setLoading(true)
    setProgress(0)
    setElapsedSeconds(0)

    conversionStartedAtRef.current = Date.now()

    setStatus('uploading')

    try {
      const blob = await convertDocument(
        file,
        selected.target.toLowerCase(),

        (event) => {
          if (event.stage === 'uploading') {
            setProgress(event.progress)
            setStatus('uploading')
          }

          if (event.stage === 'converting') {
            setProgress(100)
            setStatus('converting')
          }
        },

        {
          pdfMode
        }
      )

      const filename =
        `${file.name.replace(/\.[^.]+$/, '')}.${selected.target.toLowerCase()}`

      setResult({
        blob,
        filename
      })

      setProgress(100)
      setStatus('done')

      setUploadedCount((count) => count + 1)

      playDing()

    } catch (err) {
      setStatus('error')

      setError(
        err.message || 'Konversi dokumen gagal.'
      )

    } finally {
      setLoading(false)
    }
  }


  // ==========================================================
  // CONVERSION TIMER
  // ==========================================================

  useEffect(() => {
    if (
      !['uploading', 'converting'].includes(status) ||
      !conversionStartedAtRef.current
    ) {
      return undefined
    }

    const updateElapsed = () => {
      const elapsed = Math.floor(
        (Date.now() - conversionStartedAtRef.current) / 1000
      )

      setElapsedSeconds(elapsed)
    }

    updateElapsed()

    const timer = window.setInterval(
      updateElapsed,
      1000
    )

    return () => {
      window.clearInterval(timer)
    }
  }, [status])


  // ==========================================================
  // RESIZE CANVAS
  // ==========================================================

  const resizeCanvas = () => {
    const canvas = canvasRef.current
    const court = courtRef.current

    if (!canvas || !court) return

    const rect = court.getBoundingClientRect()

    const ratio = Math.min(
      window.devicePixelRatio || 1,
      2
    )

    canvas.width = Math.round(rect.width * ratio)
    canvas.height = Math.round(rect.height * ratio)

    canvas
      .getContext('2d')
      ?.setTransform(ratio, 0, 0, ratio, 0, 0)

    requestCanvasFrame()
  }


  // ==========================================================
  // DRAW AIM PREVIEW
  // ==========================================================

  function drawCanvas(timestamp) {
    canvasFrameRef.current = null

    const canvas = canvasRef.current
    const court = courtRef.current

    const context = canvas?.getContext('2d')

    if (!canvas || !court || !context) return

    const rect = court.getBoundingClientRect()

    context.clearRect(
      0,
      0,
      rect.width,
      rect.height
    )

    const preview = aimPreviewRef.current

    if (!preview) return

    preview.points.forEach((point, index) => {
      const pulse =
        0.88 + 0.12 * Math.sin(timestamp * 0.008 - index * 0.5)

      context.save()

      context.globalAlpha = point.opacity * pulse
      context.fillStyle = '#5548c7'

      context.shadowColor = '#756be0'
      context.shadowBlur = 6

      context.beginPath()

      context.arc(
        point.x,
        point.y,
        point.radius * pulse,
        0,
        Math.PI * 2
      )

      context.fill()
      context.restore()
    })

    requestCanvasFrame()
  }


  // ==========================================================
  // CANVAS FRAME
  // ==========================================================

  function requestCanvasFrame() {
    if (canvasFrameRef.current === null) {
      canvasFrameRef.current = requestAnimationFrame(drawCanvas)
    }
  }


  // ==========================================================
  // BASKET GEOMETRY
  // ==========================================================

  const getHoopArea = () => {
    const rect = hoopRef.current?.getBoundingClientRect()

    if (!rect || rect.width < 10 || rect.height < 4) {
      return null
    }

    const centerX = rect.left + rect.width / 2

    const halfOpening = Math.max(
      7,
      rect.width * 0.16
    )

    return {
      centerX,
      rimY: rect.top + rect.height / 2,
      left: centerX - halfOpening,
      right: centerX + halfOpening
    }
  }


  const readGeometry = () => {
    const hoop = getHoopArea()
    const court = courtRef.current

    if (!hoop || !court) return null

    return {
      hoop,
      courtRect: court.getBoundingClientRect()
    }
  }


  // ==========================================================
  // AUTO AIM TRAJECTORY
  // ==========================================================

  const buildAutoAimTrajectory = (start, geometry) => {
    if (!geometry) return null

    const { hoop, courtRect } = geometry

    const lobHeight = Math.max(
      MIN_LOB_HEIGHT,
      courtRect.width * LOB_HEIGHT_RATIO
    )

    const apexY = Math.min(
      start.y,
      hoop.rimY
    ) - lobHeight

    const vy = -Math.sqrt(
      2 * GRAVITY * (start.y - apexY)
    )

    const riseTime = -vy / GRAVITY

    const fallTime = Math.sqrt(
      (2 * (hoop.rimY - apexY)) / GRAVITY
    )

    const flightTime = riseTime + fallTime

    const velocity = {
      vx: (hoop.centerX - start.x) / flightTime,
      vy
    }

    const points = []

    const steps = Math.ceil(
      flightTime / AIM_STEP
    )

    for (
      let index = AIM_DOT_INTERVAL;
      index < steps;
      index += AIM_DOT_INTERVAL
    ) {
      const time = index * AIM_STEP
      const ratio = time / flightTime

      points.push({
        x:
          start.x +
          velocity.vx * time -
          courtRect.left,

        y:
          start.y +
          velocity.vy * time +
          0.5 * GRAVITY * time * time -
          courtRect.top,

        radius: 1.9 + 1.5 * ratio,
        opacity: 0.5 + 0.5 * ratio
      })
    }

    const hitPoint = {
      x: hoop.centerX - courtRect.left,
      y: hoop.rimY - courtRect.top
    }

    points.push({
      ...hitPoint,
      radius: 3.5,
      opacity: 1
    })

    return {
      velocity,
      points,
      hitPoint,
      flightTime
    }
  }


  // ==========================================================
  // RETURN DOCUMENT TO REST
  // ==========================================================

  const returnToRest = (token) => {
    const from = token.style.transform || REST_TRANSFORM

    token.style.transform = REST_TRANSFORM
    token.style.opacity = '1'

    return token
      .animate(
        [
          { transform: from },
          { transform: REST_TRANSFORM }
        ],
        {
          duration: 320,
          easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)'
        }
      )
      .finished.catch(() => {})
  }


  // ==========================================================
  // PROJECTILE ANIMATION
  // ==========================================================

  const animateProjectile = (
    trajectory,
    startCenter,
    restCenter
  ) => new Promise((resolve) => {
    const token = tokenRef.current

    const geometry = readGeometry()

    if (!token || !geometry) {
      resolve(false)
      return
    }

    const { hoop, courtRect } = geometry

    const { velocity, flightTime } = trajectory

    let elapsed = 0
    let previousTime = 0

    let previousX = startCenter.x
    let previousY = startCenter.y

    let finished = false

    const poseAt = (time) => {
      const progress = Math.min(
        time / flightTime,
        1
      )

      return {
        rotation:
          FLIGHT_TILT_START +
          (FLIGHT_TILT_END - FLIGHT_TILT_START) *
          progress,

        scale:
          1 -
          (1 - FLIGHT_SCALE_END) *
          progress
      }
    }

    const stopFrame = () => {
      if (projectileFrameRef.current !== null) {
        cancelAnimationFrame(projectileFrameRef.current)
        projectileFrameRef.current = null
      }
    }

    const finishHit = (crossingX) => {
      if (finished) return

      finished = true
      stopFrame()

      const { rotation, scale } = poseAt(elapsed)

      const base =
        `translate3d(${crossingX - restCenter.x}px, ${hoop.rimY - restCenter.y}px, 0) rotate(${rotation}deg)`

      token.style.transform =
        `${base} scale(${scale})`

      basketRef.current?.classList.add('net-scored')

      playSwish()

      const fade = token.animate(
        [
          {
            transform: `${base} scale(${scale})`,
            opacity: 1
          },
          {
            transform: `${base} scale(${scale * 0.35})`,
            opacity: 0
          }
        ],
        {
          duration: 140,
          easing: 'ease-in',
          fill: 'forwards'
        }
      )

      fade.finished.then(() => {
        fade.cancel()
        token.style.opacity = '0'
        resolve(true)
      }).catch(() => {
        token.style.opacity = '0'
        resolve(true)
      })
    }

    const finishMiss = () => {
      if (finished) return

      finished = true
      stopFrame()

      playMiss()

      returnToRest(token).then(() => {
        resolve(false)
      })
    }

    const frame = (timestamp) => {
      if (finished) return

      const delta = previousTime
        ? Math.min((timestamp - previousTime) / 1000, 0.032)
        : 1 / 60

      previousTime = timestamp
      elapsed += delta

      const x =
        startCenter.x +
        velocity.vx * elapsed

      const y =
        startCenter.y +
        velocity.vy * elapsed +
        0.5 * GRAVITY * elapsed * elapsed

      const verticalVelocity =
        velocity.vy + GRAVITY * elapsed

      if (
        previousY < hoop.rimY &&
        y >= hoop.rimY &&
        verticalVelocity > 0
      ) {
        const ratio =
          (hoop.rimY - previousY) /
          (y - previousY)

        const crossingX =
          previousX +
          (x - previousX) * ratio

        if (
          crossingX >= hoop.left &&
          crossingX <= hoop.right
        ) {
          finishHit(crossingX)
          return
        }
      }

      const { rotation, scale } = poseAt(elapsed)

      token.style.transform =
        `translate3d(${x - restCenter.x}px, ${y - restCenter.y}px, 0) rotate(${rotation}deg) scale(${scale})`

      previousX = x
      previousY = y

      const outsideCourt =
        x < courtRect.left - 100 ||
        x > courtRect.right + 100 ||
        y > courtRect.bottom + 100

      if (
        outsideCourt ||
        elapsed >= flightTime + MISS_TIMEOUT
      ) {
        finishMiss()
        return
      }

      projectileFrameRef.current =
        requestAnimationFrame(frame)
    }

    token.style.opacity = '1'

    projectileFrameRef.current =
      requestAnimationFrame(frame)
  })


  // ==========================================================
  // SHOOT DOCUMENT
  // ==========================================================

  const shootDocument = async (
    trajectory,
    startCenter,
    restCenter
  ) => {
    if (!trajectory || shootingRef.current) return

    shootingRef.current = true

    playWhoosh()

    setIsShooting(true)
    setStatus('shooting')
    setError('')

    basketRef.current?.classList.remove('net-scored')

    try {
      const scored = await animateProjectile(
        trajectory,
        startCenter,
        restCenter
      )

      if (scored) {
        await handleConvert()
      } else {
        setStatus('ready')

        setError(
          'MISS! Arah lemparan tidak mengenai ring. Coba lagi.'
        )
      }

    } catch (err) {
      setStatus('ready')

      setError(
        err.message ||
        'Terjadi kesalahan saat melempar dokumen.'
      )

    } finally {
      shootingRef.current = false
      setIsShooting(false)
    }
  }


  // ==========================================================
  // POINTER DOWN
  // ==========================================================

  const handlePointerDown = (event) => {
    if (
      !file ||
      isBusy ||
      shootingRef.current ||
      (event.pointerType === 'mouse' && event.button !== 0)
    ) {
      return
    }

    event.preventDefault()

    unlockAudio()

    event.currentTarget.setPointerCapture(
      event.pointerId
    )

    event.currentTarget
      .getAnimations()
      .forEach((animation) => animation.cancel())

    resizeCanvas()

    const rect =
      event.currentTarget.getBoundingClientRect()

    const origin = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    }

    geometryRef.current = readGeometry()

    pointerRef.current = {
      pointerId: event.pointerId,

      startX: event.clientX,
      startY: event.clientY,

      originX: origin.x,
      originY: origin.y,

      center: origin
    }

    aimPreviewRef.current =
      buildAutoAimTrajectory(
        origin,
        geometryRef.current
      )

    requestCanvasFrame()

    setDraggingFile(true)
    setError('')
  }


  // ==========================================================
  // POINTER MOVE
  // ==========================================================

  const handlePointerMove = (event) => {
    const pointer = pointerRef.current
    const token = tokenRef.current

    if (
      !pointer ||
      !token ||
      event.pointerId !== pointer.pointerId
    ) {
      return
    }

    const offsetX = event.clientX - pointer.startX
    const offsetY = event.clientY - pointer.startY

    pointer.center = {
      x: pointer.originX + offsetX,
      y: pointer.originY + offsetY
    }

    token.style.transform =
      `translate3d(${offsetX}px, ${offsetY}px, 0)`

    aimPreviewRef.current =
      buildAutoAimTrajectory(
        pointer.center,
        geometryRef.current
      )

    requestCanvasFrame()
  }


  // ==========================================================
  // POINTER UP
  // ==========================================================

  const handlePointerUp = (event) => {
    const pointer = pointerRef.current
    const token = tokenRef.current

    if (
      !pointer ||
      !token ||
      event.pointerId !== pointer.pointerId
    ) {
      return
    }

    const startCenter = pointer.center

    const restCenter = {
      x: pointer.originX,
      y: pointer.originY
    }

    const dragDistance = Math.hypot(
      startCenter.x - restCenter.x,
      startCenter.y - restCenter.y
    )

    const trajectory = buildAutoAimTrajectory(
      startCenter,
      geometryRef.current ?? readGeometry()
    )

    pointerRef.current = null
    geometryRef.current = null
    aimPreviewRef.current = null

    setDraggingFile(false)

    requestCanvasFrame()

    if (dragDistance < MIN_DRAG_DISTANCE) {
      returnToRest(token)
      return
    }

    if (!trajectory) {
      returnToRest(token)

      setError(
        'Lintasan belum dapat diarahkan ke ring. Geser dokumen ke area lain dan coba lagi.'
      )

      return
    }

    shootDocument(
      trajectory,
      startCenter,
      restCenter
    )
  }


  // ==========================================================
  // POINTER CANCEL
  // ==========================================================

  const handlePointerCancel = () => {
    pointerRef.current = null
    geometryRef.current = null
    aimPreviewRef.current = null

    setDraggingFile(false)

    if (tokenRef.current) {
      returnToRest(tokenRef.current)
    }

    requestCanvasFrame()
  }


  // ==========================================================
  // EXTERNAL FILE DROP
  // ==========================================================

  const handleCourtDrop = (event) => {
    event.preventDefault()

    setDragging(false)

    handleFile(
      event.dataTransfer.files?.[0]
    )
  }


  // ==========================================================
  // FILE INPUT
  // ==========================================================

  const handleFileInput = (event) => {
    handleFile(
      event.target.files?.[0]
    )

    event.target.value = ''
  }


  // ==========================================================
  // CANVAS RESIZE AND CLEANUP
  // ==========================================================

  useEffect(() => {
    resizeCanvas()

    const observer =
      typeof ResizeObserver !== 'undefined' &&
      courtRef.current
        ? new ResizeObserver(resizeCanvas)
        : null

    if (observer && courtRef.current) {
      observer.observe(courtRef.current)
    }

    window.addEventListener(
      'resize',
      resizeCanvas
    )

    return () => {
      observer?.disconnect()

      window.removeEventListener(
        'resize',
        resizeCanvas
      )

      if (canvasFrameRef.current !== null) {
        cancelAnimationFrame(
          canvasFrameRef.current
        )
      }

      if (projectileFrameRef.current !== null) {
        cancelAnimationFrame(
          projectileFrameRef.current
        )
      }

      canvasFrameRef.current = null
      projectileFrameRef.current = null
    }
  }, [])


  // ==========================================================
  // SOUND ON/OFF
  // ==========================================================

  useEffect(() => {
    setMuted(muted)

    try {
      window.localStorage.setItem(
        MUTE_STORAGE_KEY,
        muted ? '1' : '0'
      )
    } catch {
      // Preference simply will not persist.
    }
  }, [muted])


  // ==========================================================
  // AUTO DISMISS DONE CARD
  // ==========================================================

  useEffect(() => {
    if (status !== 'done') return undefined

    const timer = window.setTimeout(
      () => setCardDismissed(true),
      CARD_DONE_VISIBLE_MS
    )

    return () => {
      window.clearTimeout(timer)
    }
  }, [status])


  const captionText = draggingFile
    ? 'RELEASE TO SHOOT!'
    : hasDocument
      ? 'AIM THE FILE & RELEASE TO SHOOT INTO THE BASKET'
      : 'DROP YOUR FILE OR BROWSE TO GET STARTED'


  // ==========================================================
  // UI
  // ==========================================================

  return (
    <main className="app">

      {/* HEADER */}
      <header className="header">

        <div className="brand">
          <div className="brand-icon">🏀</div>
          <h1>SlamDoc</h1>
        </div>

        <div className="header-actions">

          <button
            type="button"
            className="sound-toggle"
            onClick={() => setMutedState((value) => !value)}
            aria-pressed={muted}
            aria-label={
              muted
                ? 'Turn sound effects on'
                : 'Turn sound effects off'
            }
            title={muted ? 'Sound off' : 'Sound on'}
          >
            {muted ? '🔇' : '🔊'}
          </button>

          <span className="header-label">
            DOCUMENT CONVERTER
          </span>

        </div>
      </header>


      {/* HERO */}
      <section className="hero">

        <p className="eyebrow">
          DOCUMENT CONVERSION MADE FUN
        </p>

        <h2>
          Convert your files.<br />
          <span>Slam it!</span>
        </h2>

        <p className="description">
          Transform your documents into different formats with just one shot.
        </p>

      </section>


      {/* CONVERTER */}
      <section className="converter-section">

        {/* FORMAT SELECTOR */}
        <div className="format-list">

          {CONVERSIONS.map((item, index) => (
            <button
              key={`${item.source}-${item.target}`}
              type="button"
              className={`format-chip ${
                selectedIndex === index ? 'active' : ''
              }`}
              disabled={isBusy}
              onClick={() => handleFormatChange(index)}
            >
              {item.source} → {item.target}
            </button>
          ))}

        </div>


        {/* PDF MODE SELECTOR */}
        {isPdfToDocx && (

          <section
            className="pdf-mode-selector"
            aria-label="PDF to Word conversion mode"
          >

            <div className="pdf-mode-heading">
              <strong>Choose PDF to Word mode</strong>

              <span>
                Select how you want your Word document.
              </span>
            </div>

            <div className="pdf-mode-options">

              <button
                type="button"
                className={`pdf-mode-option ${
                  pdfMode === 'editable' ? 'active' : ''
                }`}
                disabled={isBusy}
                aria-pressed={pdfMode === 'editable'}
                onClick={() => handlePdfModeChange('editable')}
              >

                <span className="pdf-mode-icon">
                  <span>W</span>
                </span>

                <span className="pdf-mode-copy">
                  <strong>Editable Word</strong>

                  <small>
                    Edit text, paragraphs, and tables.
                    Layout may change.
                  </small>
                </span>

                <span className="pdf-mode-check">
                  {pdfMode === 'editable' ? '✓' : ''}
                </span>

              </button>


              <button
                type="button"
                className={`pdf-mode-option ${
                  pdfMode === 'preserve_layout' ? 'active' : ''
                }`}
                disabled={isBusy}
                aria-pressed={pdfMode === 'preserve_layout'}
                onClick={() => handlePdfModeChange('preserve_layout')}
              >

                <span className="pdf-mode-icon preserve">
                  <span>▤</span>
                </span>

                <span className="pdf-mode-copy">
                  <strong>Preserve Layout</strong>

                  <small>
                    Keep the original page appearance.
                    Text is stored as images.
                  </small>
                </span>

                <span className="pdf-mode-check">
                  {pdfMode === 'preserve_layout' ? '✓' : ''}
                </span>

              </button>

            </div>

          </section>

        )}


        {/* UPLOAD COURT */}
        <div
          ref={courtRef}
          className={`upload-court ${
            dragging ? 'drag-active' : ''
          }`}

          onDragOver={(event) => {
            event.preventDefault()

            if (!isBusy) {
              setDragging(true)
            }
          }}

          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setDragging(false)
            }
          }}

          onDrop={handleCourtDrop}
        >

          {/* DROP ZONE */}
          <div
            className={`drop-zone ${
              dragging || draggingFile
                ? 'drop-zone-active'
                : ''
            }`}
          >

            <svg
              className="drop-zone-outline"
              viewBox="0 0 600 255"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <rect
                x="2"
                y="2"
                width="596"
                height="251"
                rx="18"
              />
            </svg>


            {/* EMPTY STATE */}
            <div
              className={`upload-empty-state ${
                showCard ? 'is-hidden' : ''
              }`}
            >

              <span className="upload-cloud-icon">
                ⇧
              </span>

              <strong>
                {hasDocument
                  ? 'Ready to shoot!'
                  : 'Drop files here'}
              </strong>

              <span>
                {hasDocument
                  ? 'Drag the document; the aim will track the hoop'
                  : 'or take the shot'}
              </span>

            </div>


            {/* PROGRESS CARD */}
            {file && (

              <div
                className={`upload-progress-card ${
                  showCard ? 'is-visible' : ''
                }`}
              >

                <div className="progress-file-top">

                  <span className="file-type-badge">
                    {selected.source}
                  </span>

                  <span className="progress-filename">
                    {file.name}
                  </span>

                  <strong
                    className={`progress-status ${status}`}
                  >
                    {status === 'done'
                      ? 'Done'
                      : status === 'error'
                        ? 'Failed'
                        : status === 'converting'
                          ? 'Converting...'
                          : `${progress}%`}
                  </strong>

                </div>


                <div className="progress-track">

                  <div
                    className={`progress-fill ${
                      status === 'done'
                        ? 'completed'
                        : status === 'converting'
                          ? 'converting'
                          : ''
                    }`}
                    style={{
                      width:
                        status === 'converting'
                          ? '35%'
                          : `${progress}%`
                    }}
                  />

                </div>


                <div className="progress-file-bottom">

                  <span>
                    {status === 'done'
                      ? '✓ File converted successfully'
                      : status === 'error'
                        ? 'Conversion failed'
                        : status === 'converting'
                          ? conversionDescription
                          : 'Uploading file...'}
                  </span>

                  <span>
                    {status === 'converting'
                      ? formatElapsed(elapsedSeconds)
                      : fileSize}
                  </span>

                </div>

              </div>

            )}

          </div>


          {/* AIM PREVIEW */}
          <canvas
            ref={canvasRef}
            className="particle-canvas"
            aria-hidden="true"
          />


          {/* BASKETBALL HOOP */}
          <div
            ref={basketRef}
            className="basket-assembly"
          >

            <svg
              className="basket-art"
              viewBox="0 0 240 230"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >

              <rect
                x="61"
                y="8"
                width="118"
                height="91"
                rx="7"
                fill="#fff"
                stroke="#d8d4cc"
                strokeWidth="2"
              />

              <rect
                className="basket-target"
                x="98"
                y="35"
                width="44"
                height="40"
                fill="none"
                stroke="#ffc94d"
                strokeWidth="3"
              />

              <g
                className="basket-net"
                fill="none"
                stroke="#858585"
                strokeWidth="1.5"
                strokeLinecap="round"
              >

                <path d="M75 109 L94 190 M165 109 L146 190" />

                <path d="M84 110 Q88 151 99 191 M95 111 Q100 153 106 193 M106 112 Q111 155 114 194 M117 113 Q119 155 119 195" />

                <path d="M123 113 Q121 155 121 195 M134 112 Q129 155 126 194 M145 111 Q140 153 134 193 M156 110 Q152 151 141 191" />

                <path d="M79 130 Q120 140 161 130 M83 150 Q120 160 157 150 M88 170 Q120 180 152 170 M94 188 Q120 197 146 188" />

              </g>

              <ellipse
                ref={hoopRef}
                className="basket-rim"
                cx="120"
                cy="108"
                rx="45"
                ry="9"
                fill="#ffffff"
                fillOpacity="0.15"
                stroke="#5548c7"
                strokeWidth="5"
              />

              <ellipse
                className="basket-rim-inner"
                cx="120"
                cy="108"
                rx="37"
                ry="5"
                fill="none"
                stroke="#ffe39a"
                strokeWidth="1"
              />

            </svg>

          </div>


          {/* DOCUMENT TOKEN */}
          {hasDocument && (

            <div
              ref={tokenRef}
              className={`document-token ${
                draggingFile ? 'document-dragging' : ''
              } ${
                isShooting ? 'projectile-active' : ''
              }`}

              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
            >

              <div className="document-paper">

                <div className="document-fold" />

                <span>
                  {selected.source}
                </span>

              </div>

              <small>
                {file.name}
              </small>

            </div>

          )}


          {/* BROWSE FILE */}
          <div className="court-bottom">

            <input
              ref={inputRef}
              type="file"
              hidden

              accept={
                selected.source === 'HTML'
                  ? '.html,.htm'
                  : `.${selected.source.toLowerCase()}`
              }

              onChange={handleFileInput}
            />

            <button
              type="button"
              className="browse-button"
              onClick={() => inputRef.current?.click()}
              disabled={isBusy}
            >
              + Browse File
            </button>

            <p>
              {selected.source} files · Maximum 15 MB
            </p>

          </div>


          <p className="court-caption">
            {captionText}
          </p>

        </div>


        {/* ERROR */}
        {error && (

          <div className="message-box error-message">
            ! {error}
          </div>

        )}


        {/* CONVERSION RESULT */}
        {status === 'done' && result && (

          <div className="result-card">

            <div className="result-icon">
              ✓
            </div>

            <div className="result-details">

              <h4>
                Conversion Complete!
              </h4>

              <p>
                {result.filename}
              </p>

            </div>

            <button
              type="button"
              className="download-button"
              onClick={() => downloadFile(
                result.blob,
                result.filename
              )}
            >
              ↓ Download
            </button>

          </div>

        )}


        <p className="shoot-caption">
          Move the document anywhere. The aiming path will follow the basket.
        </p>


        <div className="api-status">

          <span className="status-dot" />

          {uploadedCount} document{uploadedCount !== 1 ? 's' : ''} converted successfully

        </div>

      </section>


      {/* FOOTER */}
      <footer className="footer">

        <p>
          © {new Date().getFullYear()} SlamDoc. All rights reserved.
        </p>

      </footer>

    </main>
  )
}

export default App