import { useRef, useCallback, useEffect } from 'react'
import useAppStore from '../store/useAppStore'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws'
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2000

function triggerDownload(data) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `twinmind-session-${ts}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// Singleton socket shared across the app
let socket = null
let retryCount = 0
let retryTimer = null
let storedApiKey = null

export default function useWebSocket() {
  const {
    setConnected, setReconnecting,
    addTranscriptChunk, replaceTranscriptWithSummary,
    addSuggestionBatch, setSuggestionsError, setSuggestionsGenerating,
    updateLastAssistantMessage, setChatStreaming,
    addToast,
  } = useAppStore()

  const handlersRef = useRef({
    setConnected, setReconnecting,
    addTranscriptChunk, replaceTranscriptWithSummary,
    addSuggestionBatch, setSuggestionsError, setSuggestionsGenerating,
    updateLastAssistantMessage, setChatStreaming,
    addToast,
  })

  useEffect(() => {
    handlersRef.current = {
      setConnected, setReconnecting,
      addTranscriptChunk, replaceTranscriptWithSummary,
      addSuggestionBatch, setSuggestionsError, setSuggestionsGenerating,
      updateLastAssistantMessage, setChatStreaming,
      addToast,
    }
  })

  const handleMessage = useCallback((event) => {
    let msg
    try { msg = JSON.parse(event.data) } catch { return }
    const h = handlersRef.current

    switch (msg.type) {
      case 'init_ack':
        h.setConnected(true)
        retryCount = 0
        break

      case 'transcript_update':
        h.addTranscriptChunk({ text: msg.text, timestamp: msg.timestamp })
        break

      case 'transcript_summarized':
        h.replaceTranscriptWithSummary(msg.summary, msg.replaced_timestamps)
        break

      case 'suggestions_generating':
        h.setSuggestionsGenerating(true)
        break

      case 'suggestions_update':
        h.addSuggestionBatch(msg.batch)
        break

      case 'suggestions_error':
        h.setSuggestionsError(msg.message)
        h.addToast(msg.message, 'warning')
        break

      case 'chat_response_chunk':
        if (!msg.done) {
          const current = useAppStore.getState().chatHistory.at(-1)?.content ?? ''
          h.updateLastAssistantMessage(current + msg.content)
        } else {
          h.setChatStreaming(false)
        }
        break

      case 'export_data':
        triggerDownload(msg.session)
        h.addToast('Session exported successfully', 'success', 2500)
        break

      case 'settings_ack':
        break

      case 'error':
        console.error('[WS]', msg.message)
        h.addToast(msg.message, 'error')
        break
    }
  }, [])

  const connect = useCallback((apiKey) => {
    if (socket && socket.readyState === WebSocket.OPEN) return
    storedApiKey = apiKey

    socket = new WebSocket(WS_URL)

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'init', api_key: apiKey }))
    }

    socket.onmessage = handleMessage

    socket.onclose = () => {
      handlersRef.current.setConnected(false)
      if (retryCount < MAX_RETRIES) {
        retryCount++
        handlersRef.current.setReconnecting(true)
        handlersRef.current.addToast(
          `Connection lost — reconnecting (${retryCount}/${MAX_RETRIES})…`,
          'warning', 3000
        )
        retryTimer = setTimeout(() => connect(storedApiKey), RETRY_DELAY_MS)
      } else {
        handlersRef.current.setReconnecting(false)
        handlersRef.current.addToast(
          'Connection failed after 3 attempts. Please refresh the page.',
          'error', 8000
        )
      }
    }

    socket.onerror = () => socket.close()
  }, [handleMessage])

  const send = useCallback((payload) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload))
    }
  }, [])

  useEffect(() => () => clearTimeout(retryTimer), [])

  return { connect, send }
}
