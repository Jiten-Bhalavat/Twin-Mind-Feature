import { useEffect, useRef, useState } from 'react'
import useAppStore from '../store/useAppStore'
import useAudioRecorder from '../hooks/useAudioRecorder'
import useWebSocket from '../hooks/useWebSocket'

export default function TranscriptPanel() {
  const { isRecording, transcriptChunks, addToast } = useAppStore()
  const [micError, setMicError] = useState(null)
  const bottomRef = useRef(null)
  const { send } = useWebSocket()
  const { startRecording, stopRecording } = useAudioRecorder(send)

  // Auto-scroll to latest chunk
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcriptChunks])

  const handleToggle = async () => {
    if (isRecording) {
      stopRecording()
      setMicError(null)
    } else {
      try {
        setMicError(null)
        await startRecording()
      } catch (err) {
        const msg = err.name === 'NotAllowedError'
          ? 'Microphone access denied. Please allow mic access in your browser settings.'
          : `Could not start recording: ${err.message}`
        setMicError(msg)
        addToast(msg, 'error', 6000)
      }
    }
  }

  return (
    <div className="flex flex-col h-full p-4 border-r border-white/10">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h2 className="text-sm font-semibold text-white/50 uppercase tracking-widest">
          Transcript
        </h2>
        <button
          onClick={handleToggle}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            isRecording
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-violet-500/20 text-violet-400 hover:bg-violet-500/30'
          }`}
        >
          {isRecording ? (
            <>
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              Stop
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-violet-400" />
              Start
            </>
          )}
        </button>
      </div>

      {/* Transcript content */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {micError && (
          <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 mb-2">
            {micError}
          </div>
        )}
        {transcriptChunks.length === 0 && !micError ? (
          <p className="text-sm italic text-white/25">
            {isRecording ? 'Listening… transcript appears every ~30s' : 'Press Start to begin recording'}
          </p>
        ) : (
          transcriptChunks.map((chunk, i) => (
            <div key={i} className="text-sm text-white/80 leading-relaxed">
              <span className="text-[10px] text-white/25 block mb-0.5">{chunk.timestamp}</span>
              {chunk.text}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
