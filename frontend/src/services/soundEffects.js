// Synthesized sound effects (Web Audio API): no audio files needed.
// Every function is safe to call at any time; it silently does nothing when muted
// or when the browser has no Web Audio support.

let context = null
let master = null
let noiseBuffer = null
let muted = false

const MIN_GAIN = 0.0001

function getContext() {
  if (context) return context

  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return null

  context = new AudioContextClass()
  master = context.createGain()
  master.gain.value = 0.9
  master.connect(context.destination)
  return context
}

// One second of white noise, reused by every noise-based effect
function getNoiseBuffer(ctx) {
  if (noiseBuffer) return noiseBuffer

  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = noiseBuffer.getChannelData(0)
  for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1
  return noiseBuffer
}

// Filtered noise with a quick attack and an exponential decay (air, nets, clicks)
function playNoise(ctx, { type, from, to, q = 1, start = 0, duration, attack = 0.01, gain }) {
  const time = ctx.currentTime + start
  const source = ctx.createBufferSource()
  const filter = ctx.createBiquadFilter()
  const envelope = ctx.createGain()

  source.buffer = getNoiseBuffer(ctx)
  source.loop = true

  filter.type = type
  filter.Q.value = q
  filter.frequency.setValueAtTime(from, time)
  filter.frequency.exponentialRampToValueAtTime(to, time + duration)

  envelope.gain.setValueAtTime(MIN_GAIN, time)
  envelope.gain.linearRampToValueAtTime(gain, time + attack)
  envelope.gain.exponentialRampToValueAtTime(MIN_GAIN, time + duration)

  source.connect(filter).connect(envelope).connect(master)
  source.start(time)
  source.stop(time + duration + 0.05)
}

// A single pitched tone with an optional glide
function playTone(ctx, { type = 'sine', from, to = from, start = 0, duration, attack = 0.008, gain }) {
  const time = ctx.currentTime + start
  const oscillator = ctx.createOscillator()
  const envelope = ctx.createGain()

  oscillator.type = type
  oscillator.frequency.setValueAtTime(from, time)
  if (to !== from) oscillator.frequency.exponentialRampToValueAtTime(to, time + duration)

  envelope.gain.setValueAtTime(MIN_GAIN, time)
  envelope.gain.linearRampToValueAtTime(gain, time + attack)
  envelope.gain.exponentialRampToValueAtTime(MIN_GAIN, time + duration)

  oscillator.connect(envelope).connect(master)
  oscillator.start(time)
  oscillator.stop(time + duration + 0.05)
}

// Returns the audio context only when a sound may play right now
function ready() {
  if (muted) return null

  const ctx = getContext()
  if (ctx?.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

// Browsers only allow audio after a user gesture: call this from a pointer/click handler
export function unlockAudio() {
  const ctx = getContext()
  if (ctx?.state === 'suspended') ctx.resume().catch(() => {})
}

export function setMuted(value) {
  muted = value
}

// Release: a soft rush of air that rises while the document flies
export function playWhoosh() {
  const ctx = ready()
  if (!ctx) return

  playNoise(ctx, { type: 'bandpass', from: 500, to: 2200, q: 0.9, duration: 0.55, attack: 0.2, gain: 0.16 })
}

// Score: crisp net swish plus a small thump of the paper touching the rim
export function playSwish() {
  const ctx = ready()
  if (!ctx) return

  playNoise(ctx, { type: 'highpass', from: 1800, to: 3600, q: 0.7, duration: 0.45, attack: 0.012, gain: 0.35 })
  playNoise(ctx, { type: 'bandpass', from: 900, to: 600, q: 1, duration: 0.3, attack: 0.02, gain: 0.16 })
  playTone(ctx, { from: 170, to: 90, duration: 0.12, gain: 0.22 })
}

// Done: two short rising notes, like a soft success notification
export function playDing() {
  const ctx = ready()
  if (!ctx) return

  playTone(ctx, { from: 784, duration: 0.55, gain: 0.15 })
  playTone(ctx, { from: 1568, duration: 0.4, gain: 0.03 })
  playTone(ctx, { from: 1175, start: 0.09, duration: 0.7, gain: 0.15 })
  playTone(ctx, { from: 2350, start: 0.09, duration: 0.5, gain: 0.03 })
}

// Miss: a short dull knock, no punishing "fail" sound
export function playMiss() {
  const ctx = ready()
  if (!ctx) return

  playTone(ctx, { type: 'triangle', from: 240, to: 120, duration: 0.14, gain: 0.2 })
  playNoise(ctx, { type: 'bandpass', from: 1200, to: 800, q: 1.2, duration: 0.06, attack: 0.004, gain: 0.14 })
}