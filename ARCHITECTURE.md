# TwinMind Live Suggestions — Architecture & Tech Stack

## Overview

A web application that listens to live audio from the user's microphone, continuously transcribes it, surfaces 3 context-aware live suggestions on every new transcript chunk, and provides a chatbot panel for detailed follow-up. Three-panel layout: Transcript (left) | Live Suggestions (middle) | Chat (right).

---

## Tech Stack

### Frontend
| Concern | Choice | Reason |
|---|---|---|
| Framework | React 18 + Vite | Lightweight, no SSR needed, fast HMR |
| Styling | Tailwind CSS | Fast to build, clean dark UI |
| State Management | Zustand | Simple, no boilerplate, good for real-time state |
| WebSocket client | Native browser WebSocket API | No extra deps needed |
| Audio capture | Browser MediaRecorder API | Native, no deps, supports webm/opus |

### Backend
| Concern | Choice | Reason |
|---|---|---|
| Framework | Python 3.11+ + FastAPI | Async-first, WebSocket support, fast |
| WebSocket | FastAPI native WebSocket | Built-in, no extra library |
| Audio processing | ffmpeg (subprocess) | Convert webm → 16kHz mono WAV for Whisper |
| Groq SDK | groq Python SDK | Official SDK for Whisper + LLM calls |
| Async task queue | asyncio + background tasks | Sufficient for single-session demo scope |
| CORS | FastAPI CORSMiddleware | Allow frontend origin |
| Prompt management | prompts.yaml | All prompt templates in one file, no code changes needed to tune |

### AI / Models (via Groq API)
| Task | Model |
|---|---|
| Transcription | `whisper-large-v3` |
| Live suggestions | `openai/gpt-oss-120b` |
| Chat | `openai/gpt-oss-120b` |
| Rolling transcript summary | `openai/gpt-oss-120b` |

> `openai/gpt-oss-120b` is a reasoning model — it requires `max_completion_tokens` (not `max_tokens`), `reasoning_effort`, and ignores system messages. Transcript context is injected as a priming user/assistant exchange instead.

> The Groq API key is user-provided at app launch via a modal. It is sent to the backend over WebSocket and stored in session memory only — never persisted to disk or DB.

### Deployment
| Component | Service |
|---|---|
| Frontend | Vercel (static deploy, auto from GitHub) |
| Backend | Railway (Docker/Nixpacks, auto from GitHub) |
| SSL | Vercel and Railway both provide HTTPS/WSS by default |

---

## System Architecture

```
Browser
  │
  ├── MediaRecorder API
  │     └── 30s audio chunks (webm/opus, 5s overlap)
  │           │
  │           ▼
  │     WebSocket (wss://backend)
  │           │
  │     FastAPI Backend
  │           ├── Audio pipeline
  │           │     └── ffmpeg: webm → 16kHz mono WAV
  │           │           └── Groq Whisper Large v3 → transcript chunk
  │           │                 └── Rolling summary (every 20 chunks, oldest 10 collapsed)
  │           │
  │           ├── Suggestion pipeline (every new transcript chunk)
  │           │     └── Groq openai/gpt-oss-120b
  │           │           Input: last N transcript chunks (context window)
  │           │           Output: 3 suggestion cards (JSON)
  │           │
  │           └── Chat pipeline (on demand)
  │                 └── Groq openai/gpt-oss-120b
  │                       Input: primer(transcript) + full chat history + user message
  │                       Output: streaming chat response
  │
  └── React UI (3 panels)
        ├── Left: Transcript (appends in chunks, auto-scrolls)
        ├── Middle: Live Suggestions (newest batch on top)
        └── Right: Chat (click suggestion or type freely)
```

---

## WebSocket Message Protocol

All messages are JSON.

### Client → Server
```json
{ "type": "init", "api_key": "gsk_..." }
{ "type": "audio_chunk", "data": "<base64 encoded webm blob>" }
{ "type": "chat_message", "content": "What did they mean by X?" }
{ "type": "suggestion_click", "preview": "..." }
{ "type": "refresh_suggestions" }
{ "type": "export_request" }
{ "type": "update_settings", "settings": { ... } }
{ "type": "ping" }
```

### Server → Client
```json
{ "type": "init_ack", "status": "ok" }
{ "type": "transcript_update", "text": "...", "timestamp": "..." }
{ "type": "suggestions_update", "batch": { "timestamp": "...", "suggestions": [...] } }
{ "type": "suggestions_error", "message": "..." }
{ "type": "chat_response_chunk", "content": "...", "done": false }
{ "type": "chat_response_chunk", "content": "", "done": true }
{ "type": "export_data", "session": { ... } }
{ "type": "settings_ack" }
{ "type": "pong" }
{ "type": "error", "message": "..." }
```

---

## Audio Chunking Strategy

- MediaRecorder records continuously.
- Every **30 seconds**, the current blob is finalized and sent to the backend as base64.
- A **5-second overlap** is maintained: a second MediaRecorder starts 5s before the first stops. This prevents word-boundary cuts.
- Backend deduplicates overlap via sliding window word matching.
- Format: `audio/webm;codecs=opus` → converted to 16kHz mono WAV by ffmpeg before sending to Whisper.

---

## Suggestion Generation Strategy

### Trigger
- Suggestions fire on **every new transcript chunk** — no time-based throttle.
- `suggestion_in_progress` flag prevents overlapping calls.
- Manual refresh available via `refresh_suggestions` message.

### Context window
- Last **5 transcript chunks** (configurable) fed to the LLM.
- Keeps suggestions grounded in recent conversation, not stale context.

### Suggestion types (LLM decides the mix)
- `question` — something worth asking next
- `talking_point` — a relevant fact or angle to raise
- `answer` — direct answer to a question just asked
- `fact_check` — a claim worth verifying
- `context` — background info that helps the listener

### Output format
```json
[
  { "id": "uuid", "type": "question", "preview": "...", "detail_hint": "..." },
  { "id": "uuid", "type": "fact_check", "preview": "...", "detail_hint": "..." },
  { "id": "uuid", "type": "talking_point", "preview": "...", "detail_hint": "..." }
]
```

---

## Chat Panel Behavior

- The full transcript is injected as a **priming user/assistant exchange** (not a system message) on every request — reasoning models reliably treat this as established context.
- Both suggestion clicks and typed messages go through the **same pipeline** — one prompt, one model.
- Full chat history is included on every request (no truncation).
- Responses stream token-by-token via `chat_response_chunk` messages.

---

## Rolling Transcript Summary

- When `transcript_chunks` exceeds **20 chunks**, the oldest **10 chunks** are summarized by the LLM into a single paragraph: `"Earlier in this conversation: ..."`.
- That summary chunk replaces the 10 originals in session state.
- Both the chat primer and the suggestion context window pick it up automatically (they just concatenate chunk text).
- Prevents unbounded context growth for long sessions without losing early context entirely.

---

## Prompt Management

All prompts live in `backend/prompts.yaml`:

| Key | Used by |
|---|---|
| `suggestions.default_prompt` | `services/suggestions.py` — full template with `{transcript}` |
| `chat.default_instructions` | `services/chat.py` — default behavior rules |
| `chat.primer_user_template` | `services/chat.py` — transcript injection pattern |
| `chat.primer_assistant_ack` | `services/chat.py` — assistant acknowledgment line |
| `summarizer.prompt` | `services/summarizer.py` — rolling summary template |

To update any prompt: edit `prompts.yaml` and restart the backend. No Python changes needed.

---

## Settings (runtime configurable)

| Setting | Default | Description |
|---|---|---|
| `refresh_interval` | 30s | Kept for manual refresh; suggestions now fire per chunk |
| `suggestion_context_window` | 5 chunks | How many chunks feed the suggestion model |
| `chat_context_window` | 0 (all) | How many chunks feed the chat model |
| `suggestion_prompt` | See prompts.yaml | Override the suggestion template at runtime |
| `chat_system_prompt` | See prompts.yaml | Override chat behavior instructions at runtime |

---

## Export Format (JSON)

```json
{
  "exported_at": "2026-04-22T10:00:00Z",
  "transcript": [
    { "text": "...", "timestamp": "...", "is_summary": false }
  ],
  "suggestion_batches": [
    {
      "timestamp": "...",
      "suggestions": [
        { "id": "...", "type": "question", "preview": "...", "detail_hint": "..." }
      ]
    }
  ],
  "chat_history": [
    { "role": "user", "content": "...", "timestamp": "..." },
    { "role": "assistant", "content": "...", "timestamp": "..." }
  ]
}
```

---

## Project Directory Structure

```
Twin-Mind-Feature/
├── frontend/
│   └── src/
│       ├── App.jsx
│       ├── components/
│       │   ├── TranscriptPanel.jsx
│       │   ├── SuggestionsPanel.jsx
│       │   ├── ChatPanel.jsx
│       │   ├── ApiKeyModal.jsx
│       │   ├── SettingsDrawer.jsx
│       │   └── Toast.jsx
│       ├── hooks/
│       │   ├── useWebSocket.js
│       │   └── useAudioRecorder.js
│       └── store/
│           └── useAppStore.js
│
├── backend/
│   ├── main.py
│   ├── prompts.yaml              # All LLM prompt templates
│   ├── requirements.txt
│   ├── .env.example
│   ├── routers/
│   │   └── ws.py
│   ├── services/
│   │   ├── transcription.py
│   │   ├── suggestions.py
│   │   ├── chat.py
│   │   └── summarizer.py        # Rolling transcript summary
│   ├── models/
│   │   └── schemas.py
│   └── utils/
│       └── audio.py
│
├── ARCHITECTURE.md
├── TODO.md
└── README.md
```
