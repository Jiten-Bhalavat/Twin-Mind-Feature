import { useState, useEffect } from 'react'
import useAppStore from '../store/useAppStore'
import useWebSocket from '../hooks/useWebSocket'

const DEFAULTS = {
  refreshInterval: 30,
  suggestionContextWindow: 5,
  chatContextWindow: 0,
suggestionPrompt: '',
  chatSystemPrompt: '',
}

const PLACEHOLDER_SUGGESTION = `You are an AI meeting assistant monitoring a live conversation.

Based on the transcript below, generate exactly 3 suggestions that would be most useful RIGHT NOW...

Transcript (recent context):
{transcript}

Return ONLY a JSON array with type, preview, detail_hint fields.`

const PLACEHOLDER_CHAT = `Be concise. Answer in 3-4 sentences unless the question clearly needs more depth.`

function Field({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-white/60 uppercase tracking-wider">{label}</label>
      {hint && <p className="text-[11px] text-white/30">{hint}</p>}
      {children}
    </div>
  )
}

export default function SettingsDrawer({ open, onClose }) {
  const { settings, updateSettings } = useAppStore()
  const { send } = useWebSocket()
  const [local, setLocal] = useState({ ...DEFAULTS, ...settings })
  const [saved, setSaved] = useState(false)

  // Sync when drawer opens
  useEffect(() => {
    if (open) setLocal({ ...DEFAULTS, ...settings })
  }, [open])

  const set = (key, val) => setLocal((prev) => ({ ...prev, [key]: val }))

  const handleSave = () => {
    updateSettings(local)
    send({
      type: 'update_settings',
      settings: {
        refresh_interval: local.refreshInterval,
        suggestion_context_window: local.suggestionContextWindow,
        chat_context_window: local.chatContextWindow,
suggestion_prompt: local.suggestionPrompt,
        chat_system_prompt: local.chatSystemPrompt,
      },
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleReset = () => {
    setLocal({ ...DEFAULTS })
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full max-w-md bg-[#141414] border-l border-white/10 z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-sm font-semibold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/70 text-lg leading-none transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

          {/* Timing */}
          <section className="space-y-4">
            <h3 className="text-[11px] font-semibold text-white/30 uppercase tracking-widest">Timing</h3>

            <Field label="Suggestion refresh interval (seconds)" hint="How often new suggestion batches are generated automatically">
              <input
                type="number"
                min={10}
                max={120}
                value={local.refreshInterval}
                onChange={(e) => set('refreshInterval', Number(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-violet-500 transition-colors"
              />
            </Field>

            <Field label="Suggestion context window (chunks)" hint="How many transcript chunks are sent to the suggestions model (0 = all)">
              <input
                type="number"
                min={1}
                max={20}
                value={local.suggestionContextWindow}
                onChange={(e) => set('suggestionContextWindow', Number(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-violet-500 transition-colors"
              />
            </Field>

            <Field label="Chat context window (chunks)" hint="How many transcript chunks are included in chat context (0 = full session)">
              <input
                type="number"
                min={0}
                max={50}
                value={local.chatContextWindow}
                onChange={(e) => set('chatContextWindow', Number(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-violet-500 transition-colors"
              />
            </Field>

          </section>

          {/* Prompts */}
          <section className="space-y-4">
            <h3 className="text-[11px] font-semibold text-white/30 uppercase tracking-widest">Prompts</h3>

            <Field
              label="Live suggestion prompt"
              hint="Use {transcript} as the placeholder for transcript context"
            >
              <textarea
                rows={6}
                value={local.suggestionPrompt}
                onChange={(e) => set('suggestionPrompt', e.target.value)}
                placeholder={PLACEHOLDER_SUGGESTION}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 placeholder-white/15 outline-none focus:border-violet-500 resize-none transition-colors font-mono text-xs leading-relaxed"
              />
            </Field>

            <Field
              label="Chat behavior instructions"
              hint="Write behavioral rules only — e.g. 'Answer in 3-4 lines'. Transcript is injected automatically."
            >
              <textarea
                rows={3}
                value={local.chatSystemPrompt}
                onChange={(e) => set('chatSystemPrompt', e.target.value)}
                placeholder={PLACEHOLDER_CHAT}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 placeholder-white/15 outline-none focus:border-violet-500 resize-none transition-colors font-mono text-xs leading-relaxed"
              />
            </Field>
          </section>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-white/10 shrink-0 gap-3">
          <button
            onClick={handleReset}
            className="text-xs text-white/40 hover:text-white/60 transition-colors"
          >
            Reset to defaults
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg transition-colors"
          >
            {saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>
    </>
  )
}
