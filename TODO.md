# TwinMind — Implementation TODO

> **Rule**: Complete each step fully. Test it works before moving to the next. Speed is not the goal — a solid, working demo is.

---

## Phase 0 — Environment Setup ✅

### Step 0.1 — Project scaffolding ✅
- [x] Create `frontend/` directory with React + Vite
- [x] Install frontend dependencies: Tailwind CSS, Zustand
- [x] Create `backend/` directory
- [x] Create Python virtual environment
- [x] Install backend dependencies: fastapi, uvicorn, groq, ffmpeg-python, pyyaml, python-multipart, websockets
- [x] Create `backend/requirements.txt`
- [x] Verify `ffmpeg` is installed
- [x] Create `.env.example` in backend

---

### Step 0.2 — Basic project structure ✅
- [x] Create all directories per ARCHITECTURE.md structure
- [x] Set up Tailwind CSS config
- [x] Set up 3-panel layout in `App.jsx`

---

## Phase 1 — API Key Flow ✅

### Step 1.1 — Backend WebSocket endpoint ✅
- [x] FastAPI app with CORS middleware
- [x] `/ws` WebSocket route
- [x] Handle `init` message, store api_key in session
- [x] Send `init_ack` on success

### Step 1.2 — Frontend API key modal ✅
- [x] `ApiKeyModal.jsx` — opens on load if no key
- [x] On submit: open WebSocket, send `init`
- [x] On `init_ack`: close modal, set `connected = true`

---

## Phase 2 — Audio Capture & Chunking ✅

### Step 2.1 — useAudioRecorder hook ✅
- [x] `startRecording()` / `stopRecording()`
- [x] 30s chunks with 5s overlap via dual MediaRecorder
- [x] Send base64 webm as `audio_chunk`

### Step 2.2 — Backend audio conversion ✅
- [x] `decode_and_convert(base64_data)` → WAV bytes via ffmpeg subprocess
- [x] Temp file cleanup

---

## Phase 3 — Transcription ✅

### Step 3.1 — Groq Whisper integration ✅
- [x] `transcribe_chunk(wav_bytes, api_key)` → Groq Whisper Large v3
- [x] Error handling: rate limit, invalid key, empty audio

### Step 3.2 — Transcript state & push to frontend ✅
- [x] Rolling `transcript_chunks` in session state
- [x] Send `transcript_update` to client
- [x] Overlap deduplication via sliding window word matching

### Step 3.3 — Transcript panel UI ✅
- [x] `TranscriptPanel.jsx` — renders chunks, auto-scrolls, timestamps

---

## Phase 4 — Live Suggestions ✅

### Step 4.1 — Suggestion generation service ✅
- [x] `generate_suggestions()` via `openai/gpt-oss-120b`
- [x] JSON parsing + one retry on malformed JSON

### Step 4.2 — Suggestion trigger ✅
- [x] Fires on every new transcript chunk (not time-based)
- [x] `suggestion_in_progress` guard prevents overlapping calls
- [x] Manual refresh via `refresh_suggestions`

### Step 4.3 — Suggestions panel UI ✅
- [x] `SuggestionsPanel.jsx` — newest batch on top, type badges, click to chat

---

## Phase 5 — Chat Panel ✅

### Step 5.1 — Chat service ✅
- [x] `stream_chat_response()` — streams via `openai/gpt-oss-120b`
- [x] Priming user/assistant exchange for transcript injection (reasoning model pattern)

### Step 5.2 — Chat WebSocket flow ✅
- [x] `chat_message` and `suggestion_click` both use the same pipeline
- [x] Full chat history included on every request

### Step 5.3 — Chat panel UI ✅
- [x] `ChatPanel.jsx` — streaming, auto-scroll, blinking cursor while streaming

---

## Phase 6 — Settings & Configuration ✅

### Step 6.1 — Settings drawer ✅
- [x] `SettingsDrawer.jsx` — slide-in from right
- [x] Fields: suggestion prompt, chat behavior instructions, context windows, refresh interval
- [x] Save sends `update_settings` to backend; Reset to defaults

### Step 6.2 — Backend settings handling ✅
- [x] `update_settings` message updates session settings object

---

## Phase 7 — Export ✅

### Step 7.1 — Export ✅
- [x] `export_request` WebSocket message → full session JSON
- [x] Frontend triggers browser file download

---

## Phase 8 — Polish & Integration ✅

### Step 8.1 — Error handling ✅
- [x] Toast notifications on WebSocket errors
- [x] Reconnect logic (3 retries, 2s backoff)
- [x] Groq API errors handled gracefully

### Step 8.2 — Additional features ✅
- [x] `prompts.yaml` — all prompts centralized, no code change needed to tune
- [x] Rolling transcript summary — collapses oldest 10 chunks when total exceeds 20
- [x] Improved chat primer with structured response instructions

---

## Phase 9 — Deployment

### Step 9.1 — Backend: Railway

- [ ] Create a `nixpacks.toml` in `backend/` to ensure ffmpeg is available on Railway
- [ ] Push to GitHub (already done)
- [ ] Create new Railway project → connect GitHub repo → set root directory to `backend/`
- [ ] Set start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- [ ] Railway auto-provides `$PORT` — no hardcoded port needed
- [ ] Note the Railway public URL (e.g. `https://twin-mind-backend.up.railway.app`)

**Test gate 9.1**: `curl https://<railway-url>/health` returns `{"status": "ok"}`.

---

### Step 9.2 — Frontend: environment variable for backend URL

- [ ] Create `frontend/.env.example`:
  ```
  VITE_WS_URL=wss://your-railway-backend.up.railway.app/ws
  ```
- [ ] Update `useWebSocket.js` to read `import.meta.env.VITE_WS_URL` (fall back to `ws://localhost:8000/ws` for local dev)
- [ ] Test locally with the Railway backend URL

**Test gate 9.2**: Local frontend connects to deployed Railway backend. Transcript and suggestions work over WSS.

---

### Step 9.3 — Frontend: Vercel deploy

- [ ] Create new Vercel project → connect GitHub repo → set root directory to `frontend/`
- [ ] Add environment variable in Vercel dashboard: `VITE_WS_URL = wss://<railway-url>/ws`
- [ ] Deploy → Vercel builds and publishes automatically
- [ ] Update `README.md` with live demo URL

**Test gate 9.3**: Open Vercel URL in browser → app loads → API key modal appears → WebSocket connects (DevTools Network → WS tab shows open connection).

---

### Step 9.4 — Final end-to-end on deployed app

- [ ] Run full session on live URL (5+ minutes of speech)
- [ ] Verify transcript, suggestions, chat, export all work
- [ ] Verify rolling summary kicks in after 20 chunks
- [ ] Check no mixed-content warnings (all connections are HTTPS/WSS)

**Test gate 9.4**: Deployed app passes all checks. Share public URL.

---

## Completion Checklist

- [x] All Phase 0–8 complete and working
- [x] README.md written with setup instructions
- [x] Public GitHub repo: https://github.com/Jiten-Bhalavat/Twin-Mind-Feature
- [ ] Deployed URL working (Vercel + Railway)
- [ ] Export file generated from a real session
