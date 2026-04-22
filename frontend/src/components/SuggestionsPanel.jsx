import { useRef } from 'react'
import useAppStore from '../store/useAppStore'
import useWebSocket from '../hooks/useWebSocket'

const TYPE_STYLES = {
  question:      { label: 'Question',      cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  talking_point: { label: 'Talking Point', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  answer:        { label: 'Answer',        cls: 'bg-violet-500/15 text-violet-400 border-violet-500/20' },
  fact_check:    { label: 'Fact Check',    cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  context:       { label: 'Context',       cls: 'bg-slate-500/15 text-slate-400 border-slate-500/20' },
}

function TypeBadge({ type }) {
  const style = TYPE_STYLES[type] ?? TYPE_STYLES.context
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${style.cls}`}>
      {style.label}
    </span>
  )
}

function SuggestionCard({ suggestion, onSelect }) {
  return (
    <button
      onClick={() => onSelect(suggestion)}
      className="w-full text-left p-3 rounded-lg border border-white/8 bg-white/3 hover:bg-white/7 hover:border-white/15 transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <TypeBadge type={suggestion.type} />
        <span className="text-white/20 group-hover:text-white/40 text-xs transition-colors">→</span>
      </div>
      <p className="text-sm text-white/80 leading-relaxed">{suggestion.preview}</p>
    </button>
  )
}

function BatchSection({ batch, onSelect, isLatest }) {
  const time = new Date(batch.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {isLatest && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
        <span className="text-[10px] text-white/25 uppercase tracking-wider">
          {isLatest ? 'Latest' : time}
        </span>
      </div>
      {batch.suggestions.map((s) => (
        <SuggestionCard key={s.id} suggestion={s} onSelect={onSelect} />
      ))}
    </div>
  )
}

export default function SuggestionsPanel({ onSuggestionClick }) {
  const { suggestionBatches, suggestionsError, suggestionsGenerating, isRecording } = useAppStore()
  const { send } = useWebSocket()
  const refreshTimer = useRef(null)
  const refreshingRef = useRef(false)

  const handleRefresh = () => {
    if (suggestionsGenerating || refreshingRef.current) return
    refreshingRef.current = true
    send({ type: 'refresh_suggestions' })
    // Safety clear in case the backend never responds
    refreshTimer.current = setTimeout(() => { refreshingRef.current = false }, 12000)
  }

  // Clear the safety timer once backend responds
  if (!suggestionsGenerating) {
    clearTimeout(refreshTimer.current)
    refreshingRef.current = false
  }

  return (
    <div className="flex flex-col h-full p-4 border-r border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-widest">
            Live Suggestions
          </h2>
          {suggestionsGenerating && (
            <span className="w-3 h-3 border-2 border-white/15 border-t-white/50 rounded-full animate-spin" />
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={suggestionsGenerating || !isRecording}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-white/60 transition-colors"
        >
          {suggestionsGenerating ? (
            <span className="w-3 h-3 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          ) : (
            <span>↻</span>
          )}
          Refresh
        </button>
      </div>

      {/* Error banner */}
      {suggestionsError && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 shrink-0">
          ⚠ {suggestionsError}
        </div>
      )}

      {/* Batches */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-1">
        {suggestionBatches.length === 0 ? (
          <p className="text-sm italic text-white/25">
            {isRecording
              ? suggestionsGenerating
                ? 'Generating suggestions…'
                : 'Suggestions appear after the first transcript chunk…'
              : 'Start recording to see live suggestions'}
          </p>
        ) : (
          suggestionBatches.map((batch, i) => (
            <BatchSection
              key={batch.timestamp}
              batch={batch}
              isLatest={i === 0}
              onSelect={onSuggestionClick}
            />
          ))
        )}
      </div>
    </div>
  )
}
