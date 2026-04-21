import { useState } from 'react'
import useAppStore from '../store/useAppStore'
import useWebSocket from '../hooks/useWebSocket'

export default function ApiKeyModal() {
  const [key, setKey] = useState('')
  const [status, setStatus] = useState('idle') // idle | connecting | error
  const [errorMsg, setErrorMsg] = useState('')
  const { setApiKey } = useAppStore()
  const { connect } = useWebSocket()

  const handleSubmit = async (e) => {
    e.preventDefault()
    const trimmed = key.trim()
    if (!trimmed) return

    setStatus('connecting')
    setErrorMsg('')

    try {
      // Store key locally and kick off WebSocket connection
      setApiKey(trimmed)
      connect(trimmed)

      // Wait briefly; init_ack will set connected=true in the store.
      // If no ack arrives in 5s we show an error.
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timed out')), 5000)
        const interval = setInterval(() => {
          if (useAppStore.getState().connected) {
            clearTimeout(timeout)
            clearInterval(interval)
            resolve()
          }
        }, 100)
      })
    } catch (err) {
      setStatus('error')
      const msg = err.message || 'Failed to connect. Check your API key and that the backend is running.'
      setErrorMsg(msg)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-1">Enter your Groq API Key</h2>
        <p className="text-sm text-white/50 mb-5">
          Your key is used only in this session and never stored on disk.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-violet-500 mb-3 transition-colors"
            placeholder="gsk_..."
            autoFocus
            disabled={status === 'connecting'}
          />

          {errorMsg && (
            <p className="text-red-400 text-xs mb-3">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={!key.trim() || status === 'connecting'}
            className="w-full py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {status === 'connecting' ? (
              <>
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Connecting…
              </>
            ) : (
              'Connect'
            )}
          </button>
        </form>

        <p className="text-xs text-white/30 mt-4 text-center">
          Get your key at{' '}
          <span className="text-white/50">console.groq.com</span>
        </p>
      </div>
    </div>
  )
}
