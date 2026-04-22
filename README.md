# TwinMind — Live Suggestions

A web app that listens to live audio from your microphone, continuously transcribes it, and surfaces 3 context-aware suggestions on every new transcript chunk. Click any suggestion to get a detailed answer in the chat panel, or type questions directly.

**Live demo:** *(deploy URL goes here)*
**Repo:** https://github.com/Jiten-Bhalavat/Twin-Mind-Feature

---

## Features

- **Live transcription** — mic audio split into overlapping 30s chunks, transcribed via Groq Whisper Large v3
- **Live suggestions** — 3 cards generated on every new transcript chunk: questions to ask, talking points, fact checks, answers, or context
- **Chat panel** — click any suggestion or type freely; full transcript always in context
- **Streaming responses** — chat answers stream token by token
- **Rolling transcript summary** — older chunks are auto-summarized to prevent context overflow on long sessions
- **Centralized prompts** — all LLM prompt templates live in `backend/prompts.yaml`, no code changes needed to tune them
- **Settings** — edit suggestion prompt, chat behavior, context windows at runtime
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
| Deployment | Vercel (frontend) + Railway (backend) |

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
5. Suggestions appear automatically after each transcript chunk
6. Click any suggestion card → detailed answer streams in the chat panel
7. Type follow-up questions directly in the chat input
8. Click **↓ Export** in the header to download the full session as JSON

---

## Project Structure

```
Twin-Mind-Feature/
├── backend/
│   ├── main.py                  # FastAPI app entry point
│   ├── prompts.yaml             # All LLM prompt templates (edit here to tune)
│   ├── requirements.txt
│   ├── .env.example
│   ├── routers/
│   │   └── ws.py                # WebSocket handler, session state, message routing
│   ├── services/
│   │   ├── transcription.py     # Groq Whisper — transcribe + overlap deduplication
│   │   ├── suggestions.py       # Groq LLM — 3 suggestion cards per chunk
│   │   ├── chat.py              # Groq LLM — streaming chat with transcript context
│   │   └── summarizer.py        # Rolling transcript summary for long sessions
│   ├── models/
│   │   └── schemas.py
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
│       │   ├── useWebSocket.js      # Singleton WebSocket with reconnect logic
│       │   └── useAudioRecorder.js  # MediaRecorder with 30s overlap chunking
│       └── store/
│           └── useAppStore.js       # Zustand global state
│
├── ARCHITECTURE.md              # Full system design and WebSocket protocol
├── TODO.md                      # Phase-by-phase implementation plan
└── README.md
```

---

## Prompt Strategy

All prompts live in `backend/prompts.yaml`. Edit that file and restart the backend to change any behavior — no Python code changes needed.

### Live Suggestions
The suggestion prompt receives the last N transcript chunks (default: 5, configurable) and asks the model to pick the most useful mix of:
- `question` — something worth asking next
- `talking_point` — a relevant fact or angle to raise
- `answer` — a direct answer to a question just asked
- `fact_check` — a claim worth verifying
- `context` — background info that helps the listener

Suggestions fire on **every new transcript chunk** so the panel is always current.

### Chat
`openai/gpt-oss-120b` is a reasoning model that underweights system messages. The transcript is injected as a **priming user/assistant exchange** at the start of the message list:

```
[user]      You are an expert AI assistant...
            ### TRANSCRIPT:
            <full transcript here>
            ### BEHAVIOR INSTRUCTIONS:
            Be concise...

[assistant] Understood. I have the full transcript...

[user]      <actual question>
```

Both typed questions and suggestion card clicks go through the same pipeline — one prompt, one model, consistent behavior.

### Rolling Summary
When the transcript exceeds 20 chunks, the oldest 10 are summarized into a single `"Earlier in this conversation: ..."` paragraph. This keeps the context window bounded for long sessions without losing early context entirely.

---

## Settings (runtime configurable)

| Setting | Default | Description |
|---|---|---|
| Suggestion context window | 5 chunks | How many transcript chunks feed the suggestion model |
| Chat context window | 0 (all) | How many chunks feed the chat model |
| Live suggestion prompt | See `prompts.yaml` | Full prompt template, must include `{transcript}` |
| Chat behavior instructions | See `prompts.yaml` | Behavioral rules only — transcript is injected automatically |

---

## Deployment

### Backend — Railway

1. Create a new Railway project and connect your GitHub repo
2. Set the root directory to `backend/`
3. Set the start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Railway provides `$PORT` automatically — no hardcoded port needed
5. Note the public Railway URL

### Frontend — Vercel

1. Create a new Vercel project and connect your GitHub repo
2. Set the root directory to `frontend/`
3. Add environment variable: `VITE_WS_URL = wss://<your-railway-url>/ws`
4. Deploy — Vercel builds and publishes automatically

---

## Tradeoffs

**Overlap chunking vs. clean cuts** — Audio is recorded in 30s chunks with a 5s overlap (two MediaRecorders run in parallel). This prevents words being cut at boundaries. The backend deduplicates overlapping text by finding the longest matching word sequence at chunk boundaries.

**Priming vs. system message for context** — `openai/gpt-oss-120b` is a reasoning model that underweights system messages. Injecting the transcript as a priming conversation turn (user says "here's the transcript", assistant acknowledges) gives the model the context as established fact rather than an instruction it can deprioritize.

**Single chat pipeline** — Both suggestion clicks and typed messages use the same pipeline. Fewer moving parts, easier to tune, consistent behavior across both entry points.

**Rolling summary vs. truncation** — Older transcript chunks are summarized rather than dropped. The model always has a compressed view of early conversation plus the full recent context. Token count stays bounded without losing context entirely.

**Suggestions per chunk vs. time-based** — Suggestions fire on every new transcript chunk rather than on a fixed 30s timer. This eliminates drift between chunk timing and suggestion timing, ensuring the panel always updates when new content arrives.

**No persistence** — Session state lives entirely in backend memory and frontend Zustand. Refreshing the page starts a new session. This keeps the architecture simple and avoids auth/database complexity for a demo.

**No RAG** — The full transcript is passed on every request. For a 1-hour meeting this could be 5,000–10,000 words — well within the model's context window, and the rolling summary keeps it bounded. RAG would add latency and retrieval complexity with no benefit at this scale.
