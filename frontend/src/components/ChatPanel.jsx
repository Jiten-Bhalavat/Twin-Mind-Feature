import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import useAppStore from '../store/useAppStore'
import useWebSocket from '../hooks/useWebSocket'

function UserMessage({ msg }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] bg-violet-600/30 border border-violet-500/20 rounded-2xl rounded-tr-sm px-3 py-2">
        <p className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
      </div>
    </div>
  )
}

function AssistantMessage({ msg, isStreaming }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] bg-white/5 border border-white/8 rounded-2xl rounded-tl-sm px-3 py-2">
        <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
          {msg.content}
          {isStreaming && (
            <span className="inline-block w-1.5 h-3.5 bg-white/50 ml-0.5 align-middle animate-pulse" />
          )}
        </p>
      </div>
    </div>
  )
}

const ChatPanel = forwardRef(function ChatPanel(_, ref) {
  const { chatHistory, chatStreaming, addChatMessage, updateLastAssistantMessage, setChatStreaming } = useAppStore()
  const { send } = useWebSocket()
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  // Expose sendSuggestion to parent via ref
  useImperativeHandle(ref, () => ({
    sendSuggestion(suggestion) {
      dispatchMessage(suggestion.preview, true)
    }
  }))

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  const dispatchMessage = (content, isSuggestion = false) => {
    if (!content.trim() || chatStreaming) return

    // Add user bubble immediately
    addChatMessage({ role: 'user', content, timestamp: new Date().toISOString() })
    // Add empty assistant placeholder — will be filled by streaming chunks
    addChatMessage({ role: 'assistant', content: '', timestamp: new Date().toISOString() })
    setChatStreaming(true)

    if (isSuggestion) {
      send({ type: 'suggestion_click', preview: content })
    } else {
      send({ type: 'chat_message', content })
    }
  }

  const handleSend = () => {
    dispatchMessage(input.trim())
    setInput('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full p-4">
      {/* Header */}
      <div className="shrink-0 mb-4">
        <h2 className="text-sm font-semibold text-white/50 uppercase tracking-widest">Chat</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-4">
        {chatHistory.length === 0 ? (
          <p className="text-sm italic text-white/25">
            Click a suggestion or type a question…
          </p>
        ) : (
          chatHistory.map((msg, i) => {
            const isLastAssistant = msg.role === 'assistant' && i === chatHistory.length - 1
            return msg.role === 'user'
              ? <UserMessage key={i} msg={msg} />
              : <AssistantMessage key={i} msg={msg} isStreaming={chatStreaming && isLastAssistant} />
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 shrink-0">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message… (Enter to send)"
          disabled={chatStreaming}
          rows={1}
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-white/25 resize-none disabled:opacity-40 transition-colors"
          style={{ maxHeight: '120px', overflowY: 'auto' }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || chatStreaming}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm rounded-xl transition-colors shrink-0"
        >
          {chatStreaming ? (
            <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin block" />
          ) : '↑'}
        </button>
      </div>
    </div>
  )
})

export default ChatPanel
