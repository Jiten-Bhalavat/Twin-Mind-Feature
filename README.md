# TwinMind — Live Suggestions

A web app that listens to live audio from your microphone, continuously transcribes it, and surfaces 3 context-aware suggestions every ~30 seconds. Click any suggestion to get a detailed answer in the chat panel, or type questions directly.

**Live demo:** *(deploy URL goes here)*
**Repo:** https://github.com/Jiten-Bhalavat/Twin-Mind-Feature

---

## Features

- **Live transcription** — mic audio split into overlapping 30s chunks, transcribed via Groq Whisper Large v3
- **Live suggestions** — 3 cards generated every 30s: questions to ask, talking points, fact checks, answers, or context
- **Chat panel** — click any suggestion or type freely; full transcript is always in context
- **Streaming responses** — chat answers stream token by token
- **Settings** — edit suggestion prompt, chat behavior, context windows, and refresh interval at runtime
- **Export** — download full session as JSON (transcript + suggestions + chat history)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Zustand |
| Backend | Python 3.11+, FastAPI, WebSockets |
| Transcription | Groq — Whisper Large v3 |
| Suggestions & Chat | Groq — openai/gpt-oss-120b |
| Audio conversion | ffmpeg (webm → 16kHz mono WAV) |

---

## Prerequisites

Make sure these are installed before starting:

- **Node.js** v18+ — https://nodejs.org
- **Python** 3.11+ — https://python.org
- **ffmpeg** — https://ffmpeg.org/download.html (must be on your PATH)
- **Groq API key** — https://console.groq.com

Verify ffmpeg is available:
```bash
ffmpeg -version
```

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/Jiten-Bhalavat/Twin-Mind-Feature.git
cd Twin-Mind-Feature
```

---

### 2. Backend

```bash
cd backend

# Create and activate virtual environment
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

---

### 3. Frontend

```bash
cd frontend
npm install
```

---

## Running the App

You need **two terminals** running simultaneously.

**Terminal 1 — Backend**
```bash
cd backend
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS / Linux

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 — Frontend**
```bash
cd frontend
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## First Run

1. The app opens with an API key modal
2. Paste your Groq API key (`gsk_...`) and click **Connect**
3. Click **Start** in the Transcript panel to begin recording
4. Speak — transcript appears every ~30 seconds
5. Suggestions appear automatically after the first transcript chunk
6. Click any suggestion card → detailed answer streams in the chat panel
7. Type follow-up questions directly in the chat input
8. Click **↓ Export** in the header to download the full session as JSON

---

## Project Structure

```
Twin-Mind-Feature/
├── backend/
│   ├── main.py                  # FastAPI app entry point
│   ├── requirements.txt
│   ├── .env.example
│   ├── routers/
│   │   └── ws.py                # WebSocket handler, session state, message routing
│   ├── services/
│   │   ├── transcription.py     # Groq Whisper — transcribe + overlap deduplication
│   │   ├── suggestions.py       # Groq LLM — 3 suggestion cards per batch
│   │   └── chat.py              # Groq LLM — streaming chat with transcript context
│   ├── models/
│   │   └── schemas.py           # Pydantic message schemas
│   └── utils/
│       └── audio.py             # ffmpeg audio conversion (webm → WAV)
│
├── frontend/
│   └── src/
│       ├── App.jsx              # Root — 3-panel layout, export, settings toggle
│       ├── components/
│       │   ├── TranscriptPanel.jsx
│       │   ├── SuggestionsPanel.jsx
│       │   ├── ChatPanel.jsx
│       │   ├── ApiKeyModal.jsx
│       │   ├── SettingsDrawer.jsx
│       │   └── Toast.jsx
│       ├── hooks/
│       │   ├── useWebSocket.js  # Singleton WebSocket with reconnect logic
│       │   └── useAudioRecorder.js  # MediaRecorder with 30s overlap chunking
│       └── store/
│           └── useAppStore.js   # Zustand global state
│
├── ARCHITECTURE.md              # Full system design and WebSocket protocol
├── TODO.md                      # Phase-by-phase implementation plan
└── README.md
```

---

## Prompt Strategy

### Live Suggestions
The suggestion prompt receives the last N transcript chunks (default: 5, configurable) and asks the model to pick the most useful mix of:
- `question` — something worth asking next
- `talking_point` — a relevant fact or angle to raise
- `answer` — a direct answer to a question just asked
- `fact_check` — a claim worth verifying
- `context` — background info that helps the listener

The key rule enforced in the prompt: **suggestions must reflect what was just said**, not the whole session. This keeps them timely and relevant rather than generic.

### Chat
Rather than a system message (which reasoning models often under-weight), the transcript is injected as a **priming user/assistant exchange** at the start of the messages list:

```
[user]   [Meeting transcript — use this as context]
         <full transcript here>
         [Behavior instructions]
         Be concise. Answer in 3-4 sentences...

[assistant]  Understood. I have the full transcript...

[user]   <actual question>
```

This pattern reliably gets reasoning models to treat the transcript as established context.

Both typed questions and suggestion card clicks go through the same pipeline — one prompt, one model, consistent behavior.

---

## Settings (runtime configurable)

| Setting | Default | Description |
|---|---|---|
| Suggestion refresh interval | 30s | How often new batches are generated |
| Suggestion context window | 5 chunks | How many transcript chunks feed the suggestion model |
| Chat context window | 0 (all) | How many chunks feed the chat model |
| Live suggestion prompt | See `suggestions.py` | Full prompt template, must include `{transcript}` |
| Chat behavior instructions | "Be concise..." | Behavioral rules prepended to the chat context |

---

## Tradeoffs

**Overlap chunking vs. clean cuts** — Audio is recorded in 30s chunks with a 5s overlap (two MediaRecorders run in parallel). This prevents words being cut at boundaries. The backend deduplicates overlapping text by finding the longest matching word sequence at chunk boundaries.

**Priming vs. system message for context** — `openai/gpt-oss-120b` is a reasoning model that tends to underweight system messages. Injecting the transcript as a priming conversation turn (user says "here's the transcript", assistant acknowledges) gives the model the context as established fact rather than an instruction it can deprioritize.

**Single chat pipeline** — Originally had separate "detailed answer" and "chat" prompts. Simplified to one pipeline because suggestion clicks and typed messages are functionally identical — both are user messages that need transcript context. Fewer moving parts, easier to tune.

**No persistence** — Session state lives entirely in backend memory and frontend Zustand. Refreshing the page starts a new session. This keeps the architecture simple and avoids auth/database complexity for a demo.

**No RAG** — The full transcript is passed on every request. For a 1-hour meeting this could be 5,000–10,000 words, well within the model's context window. RAG would add latency and retrieval complexity with no benefit at this scale.
