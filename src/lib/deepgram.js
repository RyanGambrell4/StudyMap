// Deepgram voice transcription - browser-side recording + server transcription

export async function transcribeAudio(audioBlob) {
  const res = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'audio/webm' },
    body: audioBlob,
  })
  if (!res.ok) throw new Error('Transcription failed')
  const data = await res.json()
  return data.transcript ?? ''
}

export function createRecorder(onStop) {
  let mediaRecorder = null
  let chunks = []

  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    chunks = []
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' })
      stream.getTracks().forEach(t => t.stop())
      onStop(blob)
    }
    mediaRecorder.start()
  }

  const stop = () => {
    if (mediaRecorder?.state === 'recording') mediaRecorder.stop()
  }

  return { start, stop }
}
