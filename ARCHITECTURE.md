# TwinMind Live Suggestions — Architecture & Tech Stack

## Overview

A web application that listens to live audio from the user's microphone, continuously transcribes it, surfaces 3 context-aware live suggestions every ~30 seconds, and provides a chatbot panel for detailed follow-up. Three-panel layout: Transcript (left) | Live Suggestions (middle) | Chat (right).

---

## Tech Stack

### Frontend
| Concern | Choice | Reason |
|---|---|---|
| Framework | React 18 + Vite | Lightweight, no SSR needed, fast HMR |
| Styling | Tailwind CSS + shadcn/ui | Fast to build, clean output, matches prototype |
| State Management | Zustand | Simple, no boilerplate, good for real-time state |
| WebSocket client | Native browser WebSocket API | No extra deps needed |
| Audio capture | Browser MediaRecorder API | Native, no deps, supports webm/opus |
| HTTP client | Axios | For non-WS calls (export, health check) |

### Backend
| Concern | Choice | Reason |
|---|---|---|
| Framework | Python 3.11 + FastAPI | Async-first, WebSocket support, fast |
| WebSocket | FastAPI native WebSocket | Built-in, no extra library |
| Audio processing | pydub + ffmpeg | Convert webm → wav for Whisper |
| Groq SDK | groq Python SDK | Official SDK for Whisper + LLM calls |
| Async task queue | asyncio + background tasks | Sufficient for single-session demo scope |
| CORS | FastAPI CORSMiddleware | Allow frontend origin |

### AI / Models (via Groq API)
| Task | Model | Notes |
|---|---|---|
| Transcription | `whisper-large-v3` | Audio chunks → text |
| Live suggestions | `meta-llama/llama-4-maverick-17b-128e-instruct` | ~120B class, Groq's flagship |
| Chat (detailed answers) | `meta-llama/llama-4-maverick-17b-128e-instruct` | Same model, longer context prompt |

> The Groq API key is user-provided at app launch via a modal popup. It is sent to the backend over WebSocket and stored in the session only (never persisted to disk or DB).

### Deployment (AWS)
| Component | Service |
|---|---|
| Frontend | S3 (static hosting) + CloudFront (CDN) |
| Backend | EC2 (t3.small or t3.medium) with uvicorn |
| Process manager | systemd or PM2 on EC2 |
| SSL | AWS Certificate Manager + CloudFront |

---

## System Architecture

```
Browser
  │
  ├── MediaRecorder API
  │     └── 30s audio chunks (webm/opus, 5s overlap)
  │           │
  │           ▼
  │     WebSocket (ws://backend)
  │           │
  │     FastAPI Backend
  │           ├── Audio buffer manager
  │           │     └── pydub: webm → wav
  │           │           └── Groq Whisper Large v3 → transcript chunk
  │           │
  │           ├── Suggestion pipeline (every 30s)
  │           │     └── Groq LLM (Llama 4 Maverick)
  │           │           Input: last N transcript chunks (context window)
  │           │           Output: 3 suggestion cards (JSON)
  │           │
  │           └── Chat pipeline (on demand)
  │                 └── Groq LLM (Llama 4 Maverick)
  │                       Input: full transcript + chat history + user message
  │                       Output: streaming chat response
  │
  └── React UI (3 panels)
        ├── Left: Transcript (appends in chunks, auto-scrolls)
        ├── Middle: Live Suggestions (newest batch on top)
        └── Right: Chat (click suggestion or type freely)
```

---

## WebSocket Message Protocol

All messages are JSON. Direction is noted.

### Client → Server
```json
{ "type": "init", "api_key": "gsk_..." }
{ "type": "audio_chunk", "data": "<base64 encoded webm blob>" }
{ "type": "chat_message", "content": "What did they mean by X?" }
{ "type": "refresh_suggestions" }
{ "type": "stop_recording" }
```

### Server → Client
```json
{ "type": "transcript_update", "text": "...", "timestamp": "..." }
{ "type": "suggestions_update", "batch": [ { "id": "...", "preview": "...", "timestamp": "..." }, ... ] }
{ "type": "chat_response_chunk", "content": "...", "done": false }
{ "type": "chat_response_chunk", "content": "", "done": true }
{ "type": "error", "message": "..." }
```

---

## Audio Chunking Strategy

- MediaRecorder records continuously.
- Every **30 seconds**, the current blob is finalized and sent to the backend as base64.
- A **5-second overlap** is maintained: the next chunk starts 5s before the previous one ended. This prevents word-boundary cuts.
- Backend reassembles the rolling transcript (deduplicating overlap with simple text diffing).
- Format: `audio/webm;codecs=opus` → converted to WAV by pydub on the backend before sending to Whisper.

---

## Suggestion Generation Strategy

### Context window
- Last **5 transcript chunks** (~2.5 minutes of context) fed to the LLM.
- This keeps suggestions grounded in recent conversation, not stale context.

### Suggestion types (LLM decides the right mix)
- **Question to ask** — something the speaker could ask next
- **Talking point** — a relevant fact or angle to bring up
- **Answer to a question asked** — if a question was just asked in the transcript
- **Fact check** — flag a claim that may need verification
- **Clarifying info** — background context that would help the listener

### Output format (structured JSON from LLM)
```json
[
  { "type": "question", "preview": "Short 1-line preview", "detail_hint": "Used to seed the chat prompt" },
  { "type": "fact_check", "preview": "...", "detail_hint": "..." },
  { "type": "talking_point", "preview": "...", "detail_hint": "..." }
]
```

---

## Chat Panel Behavior

- **Not RAG-based.** The LLM receives the full transcript as context on every request.
- Clicking a suggestion → suggestion text is added as the user message → LLM returns a detailed expansion.
- User can continue typing follow-up messages in the same chat thread.
- Chat history is maintained in frontend state only (no backend persistence).
- Responses stream token-by-token via WebSocket (`chat_response_chunk` messages).

---

## Settings & Configuration

### API Key Modal (on app load)
- Shown once when the app opens.
- User pastes their Groq API key.
- Sent to backend via `init` WebSocket message.
- Stored in backend session memory only (not localStorage, not disk).

### Settings Drawer (gear icon, top-right)
Editable fields (with hardcoded defaults):
| Setting | Default |
|---|---|
| Live suggestion prompt | See prompts section below |
| Detailed answer prompt (on click) | See prompts section below |
| Chat system prompt | See prompts section below |
| Suggestion context window (# chunks) | 5 |
| Chat context window (# chunks) | 10 (full session) |
| Suggestion refresh interval (seconds) | 30 |

---

## Default Prompts (to be tuned during implementation)

### Live Suggestion Prompt
```
You are an AI meeting assistant. Based on the following recent conversation transcript, generate exactly 3 suggestions that would be most useful to the listener RIGHT NOW.

Each suggestion should be one of: a question to ask, a talking point to raise, an answer to a question just asked, a fact to verify, or clarifying context.

Choose the mix based on what would be most valuable given the current conversation flow. Each suggestion must have a short preview (1 sentence, standalone value) and a type label.

Return JSON array only. No explanation outside the JSON.

Transcript (recent context):
{transcript}
```

### Detailed Answer Prompt (on suggestion click)
```
You are an AI meeting assistant. A user clicked on this suggestion during a live conversation:

Suggestion: {suggestion_preview}

Full conversation transcript so far:
{full_transcript}

Provide a detailed, helpful response (3-5 paragraphs) that expands on this suggestion with relevant context, examples, and actionable insights. Be direct and specific.
```

### Chat System Prompt
```
You are an AI meeting assistant with access to a live conversation transcript. Answer the user's questions clearly and concisely, drawing on the transcript context provided. If something was not mentioned in the transcript, say so.

Current transcript:
{full_transcript}
```

---

## Export Format (JSON)

```json
{
  "session_id": "...",
  "exported_at": "2026-04-21T10:00:00Z",
  "transcript": [
    { "text": "...", "timestamp": "..." }
  ],
  "suggestion_batches": [
    {
      "timestamp": "...",
      "suggestions": [
        { "type": "question", "preview": "..." }
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
twin-mind/
├── frontend/                   # React + Vite app
│   ├── src/
│   │   ├── components/
│   │   │   ├── TranscriptPanel.jsx
│   │   │   ├── SuggestionsPanel.jsx
│   │   │   ├── ChatPanel.jsx
│   │   │   ├── ApiKeyModal.jsx
│   │   │   └── SettingsDrawer.jsx
│   │   ├── hooks/
│   │   │   ├── useWebSocket.js
│   │   │   └── useAudioRecorder.js
│   │   ├── store/
│   │   │   └── useAppStore.js      # Zustand store
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── backend/                    # Python FastAPI app
│   ├── main.py                 # FastAPI app entry point
│   ├── routers/
│   │   └── ws.py               # WebSocket handler
│   ├── services/
│   │   ├── transcription.py    # Whisper via Groq
│   │   ├── suggestions.py      # LLM suggestion generation
│   │   └── chat.py             # LLM chat handler
│   ├── models/
│   │   └── schemas.py          # Pydantic message schemas
│   ├── utils/
│   │   └── audio.py            # Audio conversion (webm → wav)
│   ├── requirements.txt
│   └── .env.example
│
├── ARCHITECTURE.md             # This file
└── TODO.md                     # Step-by-step implementation plan
```
