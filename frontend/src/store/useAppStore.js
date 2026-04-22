import { create } from 'zustand'

let toastId = 0

const useAppStore = create((set) => ({
  // Connection
  connected: false,
  reconnecting: false,
  apiKey: null,
  setConnected: (connected) => set({ connected, reconnecting: false }),
  setReconnecting: (reconnecting) => set({ reconnecting }),
  setApiKey: (apiKey) => set({ apiKey }),

  // Transcript
  transcriptChunks: [],
  addTranscriptChunk: (chunk) =>
    set((state) => ({ transcriptChunks: [...state.transcriptChunks, chunk] })),

  // Suggestions
  suggestionBatches: [],
  suggestionsError: null,
  addSuggestionBatch: (batch) =>
    set((state) => ({ suggestionBatches: [batch, ...state.suggestionBatches], suggestionsError: null })),
  setSuggestionsError: (msg) => set({ suggestionsError: msg }),

  // Chat
  chatHistory: [],
  chatStreaming: false,
  setChatStreaming: (val) => set({ chatStreaming: val }),
  addChatMessage: (message) =>
    set((state) => ({ chatHistory: [...state.chatHistory, message] })),
  updateLastAssistantMessage: (content) =>
    set((state) => {
      const history = [...state.chatHistory]
      const last = history[history.length - 1]
      if (last && last.role === 'assistant') {
        history[history.length - 1] = { ...last, content }
      }
      return { chatHistory: history }
    }),

  // Recording state
  isRecording: false,
  setIsRecording: (isRecording) => set({ isRecording }),

  // Settings
  settings: {
    suggestionContextWindow: 5,
    chatContextWindow: 0,
refreshInterval: 30,
    suggestionPrompt: '',
    chatSystemPrompt: '',
  },
  updateSettings: (patch) =>
    set((state) => ({ settings: { ...state.settings, ...patch } })),

  // Toasts
  toasts: [],
  addToast: (message, type = 'info', duration = 4000) =>
    set((state) => ({
      toasts: [...state.toasts, { id: ++toastId, message, type, duration }],
    })),
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))

export default useAppStore
