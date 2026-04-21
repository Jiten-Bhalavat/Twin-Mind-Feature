import { useState, useRef } from 'react'
import TranscriptPanel from './components/TranscriptPanel'
import SuggestionsPanel from './components/SuggestionsPanel'
import ChatPanel from './components/ChatPanel'
import ApiKeyModal from './components/ApiKeyModal'
import SettingsDrawer from './components/SettingsDrawer'
import ToastContainer from './components/Toast'
import useAppStore from './store/useAppStore'
import useWebSocket from './hooks/useWebSocket'

export default function App() {
  const connected = useAppStore((s) => s.connected)
  const reconnecting = useAppStore((s) => s.reconnecting)
  const transcriptChunks = useAppStore((s) => s.transcriptChunks)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const chatRef = useRef(null)
  const { send } = useWebSocket()

  const handleSuggestionClick = (suggestion) => {
    chatRef.current?.sendSuggestion(suggestion)
  }

  const handleExport = () => {
    send({ type: 'export_request' })
  }

  return (
    <div className="flex flex-col h-screen bg-[#0f0f0f] text-white">
      {/* Reconnecting banner */}
      {reconnecting && (
        <div className="bg-amber-500/15 border-b border-amber-500/20 px-4 py-1.5 text-xs text-amber-400 text-center shrink-0">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse mr-2" />
          Reconnecting to server…
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="font-semibold tracking-tight text-white">TwinMind</span>
          {connected && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Connected" />
          )}
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleExport}
            disabled={!connected || transcriptChunks.length === 0}
            className="text-white/40 hover:text-white/70 disabled:opacity-20 disabled:cursor-not-allowed text-xs uppercase tracking-widest transition-colors"
          >
            ↓ Export
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-white/40 hover:text-white/70 text-xs uppercase tracking-widest transition-colors"
          >
            ⚙ Settings
          </button>
        </div>
      </header>

      {/* 3-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/3 overflow-hidden">
          <TranscriptPanel />
        </div>
        <div className="w-1/3 overflow-hidden">
          <SuggestionsPanel onSuggestionClick={handleSuggestionClick} />
        </div>
        <div className="w-1/3 overflow-hidden">
          <ChatPanel ref={chatRef} />
        </div>
      </div>

      {!connected && !reconnecting && <ApiKeyModal />}

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ToastContainer />
    </div>
  )
}
