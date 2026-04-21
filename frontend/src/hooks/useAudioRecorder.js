import { useRef, useCallback } from 'react'
import useAppStore from '../store/useAppStore'

const CHUNK_INTERVAL_MS = 30_000  // 30s main chunk
const OVERLAP_MS = 5_000          // 5s overlap — start next recorder before stopping current

export default function useAudioRecorder(send) {
  const activeRecorder = useRef(null)  // currently recording MediaRecorder
  const overlapRecorder = useRef(null) // overlap recorder (runs during last 5s of active)
  const chunkTimer = useRef(null)
  const overlapTimer = useRef(null)
  const streamRef = useRef(null)
  const { setIsRecording } = useAppStore()

  const sendBlob = useCallback((blob) => {
    if (blob.size === 0) return
    const reader = new FileReader()
    reader.onloadend = () => {
      // reader.result is "data:<mime>;base64,<data>" — strip the prefix
      const base64 = reader.result.split(',')[1]
      send({ type: 'audio_chunk', data: base64 })
    }
    reader.readAsDataURL(blob)
  }, [send])

  const createRecorder = useCallback((stream) => {
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    const recorder = new MediaRecorder(stream, { mimeType })
    const chunks = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    recorder.onstop = () => {
      if (chunks.length > 0) {
        sendBlob(new Blob(chunks, { type: mimeType }))
      }
    }

    return recorder
  }, [sendBlob])

  const scheduleNext = useCallback((stream) => {
    // At CHUNK_INTERVAL_MS - OVERLAP_MS: start the overlap recorder
    overlapTimer.current = setTimeout(() => {
      overlapRecorder.current = createRecorder(stream)
      overlapRecorder.current.start()

      // At CHUNK_INTERVAL_MS: stop active recorder, promote overlap to active
      chunkTimer.current = setTimeout(() => {
        if (activeRecorder.current) {
          activeRecorder.current.stop()
        }
        activeRecorder.current = overlapRecorder.current
        overlapRecorder.current = null
        scheduleNext(stream)
      }, OVERLAP_MS)

    }, CHUNK_INTERVAL_MS - OVERLAP_MS)
  }, [createRecorder])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      activeRecorder.current = createRecorder(stream)
      activeRecorder.current.start()
      setIsRecording(true)
      scheduleNext(stream)
    } catch (err) {
      console.error('Mic access denied:', err)
      throw err
    }
  }, [createRecorder, scheduleNext, setIsRecording])

  const stopRecording = useCallback(() => {
    clearTimeout(chunkTimer.current)
    clearTimeout(overlapTimer.current)

    if (activeRecorder.current && activeRecorder.current.state !== 'inactive') {
      activeRecorder.current.stop()
    }
    if (overlapRecorder.current && overlapRecorder.current.state !== 'inactive') {
      overlapRecorder.current.stop()
    }

    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    activeRecorder.current = null
    overlapRecorder.current = null
    setIsRecording(false)
  }, [setIsRecording])

  return { startRecording, stopRecording }
}
