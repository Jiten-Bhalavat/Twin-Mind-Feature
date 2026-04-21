# TwinMind — Implementation TODO

> **Rule**: Complete each step fully. Test it works before moving to the next. Speed is not the goal — a solid, working demo is.

---

## Phase 0 — Environment Setup

### Step 0.1 — Project scaffolding
- [ ] Create `frontend/` directory with React + Vite
  - `npm create vite@latest frontend -- --template react`
- [ ] Install frontend dependencies: Tailwind CSS, shadcn/ui, Zustand, Axios
- [ ] Create `backend/` directory
- [ ] Create Python virtual environment (`python -m venv venv`)
- [ ] Install backend dependencies: fastapi, uvicorn, groq, pydub, python-multipart, websockets
- [ ] Create `backend/requirements.txt`
- [ ] Verify `ffmpeg` is installed (needed by pydub for audio conversion)
- [ ] Create `.env.example` in backend

**Test gate 0.1**: Run `npm run dev` in frontend → blank React page loads at localhost:5173. Run `uvicorn main:app` in backend → FastAPI starts at localhost:8000. `/docs` page opens in browser.

---

### Step 0.2 — Basic project structure
- [ ] Create all directories per ARCHITECTURE.md structure
- [ ] Create placeholder files for all components, services, hooks
- [ ] Set up Tailwind CSS config
- [ ] Initialize shadcn/ui (`npx shadcn-ui@latest init`)
- [ ] Set up 3-panel layout in `App.jsx` (static, no logic yet) — left/middle/right columns

**Test gate 0.2**: Frontend shows the 3-column layout with placeholder text in each panel. No errors in console.

---

## Phase 1 — API Key Flow

### Step 1.1 — Backend WebSocket endpoint
- [ ] Create `backend/main.py` with FastAPI app, CORS middleware
- [ ] Create `backend/routers/ws.py` with `/ws` WebSocket route
- [ ] Handle `init` message type: receive `api_key`, store in connection session object
- [ ] Send back `{ "type": "init_ack", "status": "ok" }` on success
- [ ] Return `{ "type": "error", "message": "No API key provided" }` if missing

**Test gate 1.1**: Connect to `ws://localhost:8000/ws` using a WebSocket test client (e.g., browser console or Postman). Send `{ "type": "init", "api_key": "test_key" }`. Receive `init_ack`. Check backend logs show key received.

---

### Step 1.2 — Frontend API key modal
- [ ] Build `ApiKeyModal.jsx` — opens on app load if no key in session
- [ ] Input field for Groq API key + submit button
- [ ] On submit: open WebSocket connection, send `init` message with key
- [ ] On receiving `init_ack`: close modal, store `connected = true` in Zustand store
- [ ] Show loading spinner between submit and ack
- [ ] Show error message if WebSocket returns error

**Test gate 1.2**: Open app → modal appears. Enter any string as key → modal closes → Zustand store shows `connected: true`. Check Network tab in DevTools → WebSocket connection is open.

---

## Phase 2 — Audio Capture & Chunking

### Step 2.1 — useAudioRecorder hook
- [ ] Build `useAudioRecorder.js` hook
- [ ] `startRecording()`: requests mic permission, starts MediaRecorder (`audio/webm;codecs=opus`)
- [ ] Every 30 seconds, call `MediaRecorder.stop()` then `MediaRecorder.start()` (creates a new blob)
- [ ] On `dataavailable`: base64-encode the blob, send over WebSocket as `{ "type": "audio_chunk", "data": "..." }`
- [ ] Implement 5-second overlap: buffer the last 5s of previous chunk and prepend to next
- [ ] `stopRecording()`: stops MediaRecorder cleanly, sends final chunk

**Test gate 2.1**: Click start → mic permission requested. Wait 30s → DevTools Network/WS tab shows `audio_chunk` message sent. Backend logs show message received with base64 data. Stop button works cleanly.

---

### Step 2.2 — Backend audio conversion
- [ ] Build `backend/utils/audio.py`
- [ ] `decode_and_convert(base64_data) -> wav_bytes`: base64 decode → write temp webm file → pydub converts to wav → return wav bytes
- [ ] Handle conversion errors gracefully (log and skip chunk if corrupt)
- [ ] Clean up temp files after conversion

**Test gate 2.2**: Send a real audio chunk from the frontend. Backend logs show successful conversion. No temp files left on disk after processing.

---

## Phase 3 — Transcription

### Step 3.1 — Groq Whisper integration
- [ ] Build `backend/services/transcription.py`
- [ ] `transcribe_chunk(wav_bytes, api_key) -> str`: call Groq Whisper Large v3 with wav bytes
- [ ] Return transcript text string
- [ ] Handle API errors: rate limit, invalid key, empty audio

**Test gate 3.1**: Send a real 30s audio chunk from mic. Backend calls Groq Whisper and logs the transcript text. Verify text is accurate for what was said.

---

### Step 3.2 — Transcript state & push to frontend
- [ ] Maintain rolling `transcript_chunks: list[dict]` in WebSocket session state
- [ ] Each chunk: `{ "text": "...", "timestamp": ISO string }`
- [ ] After transcription, append to session state
- [ ] Send `{ "type": "transcript_update", "text": "...", "timestamp": "..." }` to client
- [ ] Basic deduplication: trim leading words from new chunk if they match trailing words of previous chunk (handles 5s overlap)

**Test gate 3.2**: Speak for 60+ seconds → frontend receives two `transcript_update` messages → transcript text is coherent with no duplicated sentences at chunk boundaries.

---

### Step 3.3 — Transcript panel UI
- [ ] Build `TranscriptPanel.jsx`
- [ ] Listens to Zustand store for `transcriptChunks` array
- [ ] Renders each chunk as a paragraph with a small timestamp
- [ ] Auto-scrolls to bottom on new chunk (useEffect + ref)
- [ ] Shows "Listening…" indicator while recording is active
- [ ] Shows empty state message when not recording

**Test gate 3.3**: Speak for 60s → transcript panel shows text appearing in real time, auto-scrolling to latest. Timestamps are correct. Panel looks clean.

---

## Phase 4 — Live Suggestions

### Step 4.1 — Suggestion generation service
- [ ] Build `backend/services/suggestions.py`
- [ ] `generate_suggestions(transcript_chunks, api_key, prompt_template, context_window) -> list[dict]`
- [ ] Take last N chunks (default: 5) as context
- [ ] Call Groq LLM with the suggestion prompt from ARCHITECTURE.md
- [ ] Parse JSON response → validate it has exactly 3 items with `type`, `preview`, `detail_hint`
- [ ] Fallback: if LLM returns malformed JSON, retry once, then return empty list with error log

**Test gate 4.1**: Call the function directly in a test script with mock transcript text. Verify it returns 3 well-formed suggestion objects. Test with different conversation types (question-heavy, statement-heavy).

---

### Step 4.2 — Suggestion scheduling (auto 30s + manual)
- [ ] In WebSocket handler: after each `transcript_update`, check if 30s have passed since last suggestion batch
- [ ] If yes: run suggestion generation in background (`asyncio.create_task`)
- [ ] On `refresh_suggestions` message from client: trigger immediately regardless of timer
- [ ] Send `{ "type": "suggestions_update", "batch": [...], "timestamp": "..." }` to client
- [ ] Do not generate suggestions if transcript has fewer than 2 chunks (not enough context)

**Test gate 4.2**: Speak for 60s → two suggestion batches arrive automatically. Click manual refresh → new batch appears immediately. Each batch has exactly 3 suggestions.

---

### Step 4.3 — Suggestions panel UI
- [ ] Build `SuggestionsPanel.jsx`
- [ ] Show newest batch at top, older batches below (accordion or flat list)
- [ ] Each suggestion: card with `preview` text and `type` badge (color-coded)
- [ ] Clicking a suggestion card triggers `onSuggestionClick(suggestion)` → passed to Chat panel
- [ ] Manual refresh button (with loading spinner while generating)
- [ ] Show timestamp of each batch
- [ ] Empty state: "Suggestions will appear after ~30s of conversation"

**Test gate 4.3**: Full flow — speak 60s, see suggestions appear in middle panel. Cards are readable, type badges show. Click a card → visually confirms it's been selected (highlight or animation).

---

## Phase 5 — Chat Panel

### Step 5.1 — Chat service (backend)
- [ ] Build `backend/services/chat.py`
- [ ] `generate_chat_response(messages, full_transcript, api_key, system_prompt) -> AsyncGenerator[str]`
- [ ] System prompt includes full transcript as context
- [ ] Stream tokens back using Groq streaming API
- [ ] Yield each token chunk as string

**Test gate 5.1**: Call function in test script with a mock transcript and question. Verify streamed response arrives token by token. Verify transcript context influences the answer.

---

### Step 5.2 — Chat WebSocket flow
- [ ] Handle `chat_message` WebSocket message from client
- [ ] Prepend system prompt with full current transcript
- [ ] Maintain `chat_history` list in session state
- [ ] Call `generate_chat_response` and stream back via `chat_response_chunk` messages
- [ ] Send `{ "type": "chat_response_chunk", "content": "...", "done": false }` per token
- [ ] Send `{ "type": "chat_response_chunk", "content": "", "done": true }` when complete
- [ ] Append completed response to `chat_history`

**Test gate 5.2**: Send a `chat_message` via WebSocket test client (with a transcript loaded). Verify streaming chunks arrive. Verify `done: true` arrives at end. Verify answer is relevant to transcript content.

---

### Step 5.3 — Suggestion-to-chat flow
- [ ] When user clicks a suggestion card, frontend sends:
  `{ "type": "chat_message", "content": "[Suggestion clicked]: {preview}\n\nPlease expand on this in detail." }`
- [ ] Backend recognizes this as a chat message (same flow as Step 5.2), but uses the detailed answer prompt
- [ ] Response appears in chat panel as if user asked the question

**Test gate 5.3**: Click a suggestion card → chat panel shows the suggestion as a user message → detailed streamed response appears. Then type a follow-up question manually → it continues the conversation naturally.

---

### Step 5.4 — Chat panel UI
- [ ] Build `ChatPanel.jsx`
- [ ] Message list: user messages (right-aligned), assistant messages (left-aligned)
- [ ] Streaming: assistant message renders token by token as chunks arrive
- [ ] Text input + send button at bottom
- [ ] Pressing Enter submits message
- [ ] Auto-scrolls to latest message
- [ ] Loading indicator while waiting for first token
- [ ] Empty state: "Click a suggestion or type a question"

**Test gate 5.4**: Full chat flow — click suggestion, see streamed answer. Type follow-up, see streamed response. UI is clean, scrolls correctly, no layout breaks.

---

## Phase 6 — Settings & Configuration

### Step 6.1 — Settings drawer (frontend)
- [ ] Build `SettingsDrawer.jsx` — slide-in from right, triggered by gear icon
- [ ] Editable fields with defaults (from ARCHITECTURE.md):
  - Live suggestion prompt (textarea)
  - Detailed answer prompt (textarea)
  - Chat system prompt (textarea)
  - Suggestion context window (number input, default: 5)
  - Chat context window (number input, default: full session)
  - Suggestion refresh interval in seconds (number input, default: 30)
- [ ] Save button: sends updated settings to backend via WebSocket
  `{ "type": "update_settings", "settings": { ... } }`
- [ ] Reset to defaults button

**Test gate 6.1**: Open settings drawer → all fields show defaults. Edit suggestion prompt → save → next suggestion batch uses the new prompt (verify via backend logs).

---

### Step 6.2 — Backend settings handling
- [ ] Handle `update_settings` WebSocket message
- [ ] Update session-level settings object
- [ ] All subsequent LLM calls use updated prompts/params

**Test gate 6.2**: Change context window to 2 in settings → backend logs show only 2 chunks passed to suggestion prompt. Change prompt text → LLM receives new prompt.

---

## Phase 7 — Export

### Step 7.1 — Export endpoint
- [ ] Add `GET /export/{session_id}` REST endpoint in FastAPI
- [ ] OR: handle `{ "type": "export_request" }` WebSocket message and return full session data
- [ ] Build export JSON per ARCHITECTURE.md schema (transcript + suggestion batches + chat history + timestamps)
- [ ] Frontend: on receiving export data, trigger browser file download as `twinmind_session_{timestamp}.json`

**Test gate 7.1**: Run full session (60s of speech, get suggestions, chat). Click export → JSON file downloads. Open file — verify it contains all transcript chunks, all suggestion batches, full chat history, correct timestamps.

---

## Phase 8 — Polish & Integration

### Step 8.1 — Error handling
- [ ] Frontend: show toast notification on WebSocket errors
- [ ] Frontend: reconnect logic if WebSocket drops (retry 3 times with backoff)
- [ ] Backend: handle Groq API rate limit errors gracefully (return error message, do not crash)
- [ ] Backend: handle empty/silent audio chunks (skip transcription, log)
- [ ] Frontend: show user-friendly message if mic permission denied

**Test gate 8.1**: Kill backend mid-session → frontend shows "Connection lost, reconnecting…". Restart backend → reconnects. Send empty audio → no crash, suggestion pipeline continues.

---

### Step 8.2 — Full integration test
- [ ] Run a real 5-minute conversation (or play a YouTube video for context)
- [ ] Verify: transcript appends correctly every 30s
- [ ] Verify: suggestions are relevant, varied in type, new batch every 30s
- [ ] Verify: clicking suggestion → detailed chat response is accurate and useful
- [ ] Verify: manual follow-up questions work in chat
- [ ] Verify: settings changes take effect
- [ ] Verify: export file is complete and readable
- [ ] Fix any issues found before proceeding to deployment

**Test gate 8.2**: The full demo flow works end-to-end without manual intervention. No crashes, no blank panels, no missing data in export.

---

## Phase 9 — AWS Deployment

### Step 9.1 — Backend: EC2 setup
- [ ] Launch EC2 t3.small (Ubuntu 22.04)
- [ ] Install Python 3.11, ffmpeg, git
- [ ] Clone repo, set up venv, install requirements
- [ ] Configure systemd service to run uvicorn on port 8000
- [ ] Set up security group: allow inbound 8000 (WebSocket) and 443 (HTTPS)
- [ ] Test: hit `http://<ec2-ip>:8000/health` from browser

**Test gate 9.1**: EC2 is running. `curl http://<ec2-ip>:8000/health` returns `{"status": "ok"}`.

---

### Step 9.2 — Frontend: S3 + CloudFront
- [ ] `npm run build` in frontend → produces `dist/`
- [ ] Create S3 bucket, enable static hosting
- [ ] Upload `dist/` contents to S3
- [ ] Create CloudFront distribution pointing to S3
- [ ] Update frontend WebSocket URL to point to EC2 backend (env variable)

**Test gate 9.2**: Open CloudFront URL in browser → app loads. API key modal appears. No console errors related to asset loading.

---

### Step 9.3 — SSL & WebSocket over WSS
- [ ] Set up HTTPS on EC2 backend (nginx reverse proxy + Let's Encrypt OR AWS ALB)
- [ ] Update frontend WebSocket URL to `wss://` (not `ws://`)
- [ ] Verify WebSocket connection works over WSS from the CloudFront domain

**Test gate 9.3**: Open app via CloudFront HTTPS URL. Enter API key. WebSocket connects (check DevTools → Network → WS tab shows connection open). No mixed-content browser warnings.

---

### Step 9.4 — Final end-to-end on deployed app
- [ ] Repeat the full integration test (Step 8.2) but on the live deployed URL
- [ ] Verify latency: suggestion first-render < 5 seconds from 30s mark
- [ ] Verify chat first token < 2 seconds after sending message
- [ ] Export works on deployed app

**Test gate 9.4**: Deployed app passes all checks. Share public URL.

---

## Completion Checklist

- [ ] All Phase 0–9 test gates passed
- [ ] README.md written (setup instructions, stack choices, prompt strategy, tradeoffs)
- [ ] Public GitHub repo ready
- [ ] Deployed URL working
- [ ] Export file generated from a real session (for evaluator review)
