from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
import asyncio
import time
import logging
from datetime import datetime, timezone

from utils.audio import decode_and_convert
from services.transcription import transcribe_chunk, deduplicate_overlap
from services.suggestions import generate_suggestions
from services.chat import stream_chat_response
from services.summarizer import maybe_summarize

logger = logging.getLogger(__name__)
router = APIRouter()


class SessionState:
    def __init__(self):
        self.api_key: str | None = None
        self.transcript_chunks: list[dict] = []
        self.suggestion_batches: list[dict] = []
        self.chat_history: list[dict] = []
        self.last_suggestion_time: float = 0.0
        self.suggestion_in_progress: bool = False
        self.chat_in_progress: bool = False
        self.settings: dict = {
            "suggestion_context_window": 5,
            "chat_context_window": 0,
"refresh_interval": 30,
            "suggestion_prompt": "",
            "chat_system_prompt": "",
        }


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


async def push_suggestions(websocket: WebSocket, session: SessionState):
    if session.suggestion_in_progress or not session.transcript_chunks:
        return
    session.suggestion_in_progress = True
    session.last_suggestion_time = time.monotonic()
    try:
        loop = asyncio.get_event_loop()
        suggestions = await loop.run_in_executor(
            None,
            generate_suggestions,
            session.transcript_chunks,
            session.api_key,
            session.settings["suggestion_prompt"],
            session.settings["suggestion_context_window"],
        )
        if suggestions:
            batch = {"timestamp": utcnow(), "suggestions": suggestions}
            session.suggestion_batches.append(batch)
            await websocket.send_json({"type": "suggestions_update", "batch": batch})
            logger.info("Pushed %d suggestions", len(suggestions))
        else:
            await websocket.send_json({
                "type": "suggestions_error",
                "message": "Could not generate suggestions — check backend logs"
            })
    finally:
        session.suggestion_in_progress = False


async def process_audio(websocket: WebSocket, session: SessionState, data: str):
    loop = asyncio.get_event_loop()

    wav_bytes = await loop.run_in_executor(None, decode_and_convert, data)
    if wav_bytes is None:
        return

    text = await loop.run_in_executor(None, transcribe_chunk, wav_bytes, session.api_key)
    if not text:
        return

    if session.transcript_chunks:
        text = deduplicate_overlap(session.transcript_chunks[-1]["text"], text)
    if not text:
        return

    chunk = {"text": text, "timestamp": utcnow()}
    session.transcript_chunks.append(chunk)

    await websocket.send_json({
        "type": "transcript_update",
        "text": text,
        "timestamp": chunk["timestamp"],
    })

    loop = asyncio.get_event_loop()
    asyncio.create_task(maybe_summarize(session, loop))

    elapsed = time.monotonic() - session.last_suggestion_time
    if elapsed >= session.settings["refresh_interval"]:
        asyncio.create_task(push_suggestions(websocket, session))


async def handle_chat(websocket: WebSocket, session: SessionState, content: str):
    """Stream a chat response. Works for both typed messages and suggestion clicks."""
    if session.chat_in_progress:
        await websocket.send_json({"type": "error", "message": "Chat already in progress"})
        return

    session.chat_in_progress = True

    session.chat_history.append({"role": "user", "content": content, "timestamp": utcnow()})
    session.chat_history.append({"role": "assistant", "content": "", "timestamp": utcnow()})

    try:
        full_response = ""

        # Build messages without timestamps for the LLM, exclude empty placeholder
        llm_messages = [
            {"role": m["role"], "content": m["content"]}
            for m in session.chat_history[:-1]
        ]
        gen = stream_chat_response(
            messages=llm_messages,
            transcript_chunks=session.transcript_chunks,
            api_key=session.api_key,
            chat_instructions=session.settings["chat_system_prompt"],
            context_window=session.settings["chat_context_window"],
        )

        async for token in gen:
            full_response += token
            await websocket.send_json({
                "type": "chat_response_chunk",
                "content": token,
                "done": False,
            })

        # Finalise
        session.chat_history[-1]["content"] = full_response
        await websocket.send_json({"type": "chat_response_chunk", "content": "", "done": True})

    finally:
        session.chat_in_progress = False


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    session = SessionState()
    logger.info("WebSocket connection opened")

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            msg_type = message.get("type")

            if msg_type == "init":
                api_key = message.get("api_key", "").strip()
                if not api_key:
                    await websocket.send_json({"type": "error", "message": "No API key provided"})
                    continue
                session.api_key = api_key
                logger.info("Session initialized (key length=%d)", len(api_key))
                await websocket.send_json({"type": "init_ack", "status": "ok"})

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "audio_chunk":
                if not session.api_key:
                    await websocket.send_json({"type": "error", "message": "Not initialized"})
                    continue
                data = message.get("data", "")
                if data:
                    asyncio.create_task(process_audio(websocket, session, data))

            elif msg_type == "refresh_suggestions":
                if not session.api_key:
                    await websocket.send_json({"type": "error", "message": "Not initialized"})
                    continue
                asyncio.create_task(push_suggestions(websocket, session))

            elif msg_type == "chat_message":
                if not session.api_key:
                    await websocket.send_json({"type": "error", "message": "Not initialized"})
                    continue
                content = message.get("content", "").strip()
                if content:
                    asyncio.create_task(handle_chat(websocket, session, content))

            elif msg_type == "suggestion_click":
                if not session.api_key:
                    await websocket.send_json({"type": "error", "message": "Not initialized"})
                    continue
                preview = message.get("preview", "").strip()
                if preview:
                    asyncio.create_task(handle_chat(websocket, session, preview))

            elif msg_type == "export_request":
                if not session.api_key:
                    await websocket.send_json({"type": "error", "message": "Not initialized"})
                    continue
                payload = {
                    "type": "export_data",
                    "session": {
                        "exported_at": utcnow(),
                        "transcript": session.transcript_chunks,
                        "suggestion_batches": session.suggestion_batches,
                        "chat_history": session.chat_history,
                    }
                }
                await websocket.send_json(payload)
                logger.info("Export sent: %d transcript chunks, %d batches, %d chat messages",
                            len(session.transcript_chunks),
                            len(session.suggestion_batches),
                            len(session.chat_history))

            elif msg_type == "update_settings":
                if session.api_key:
                    session.settings.update(message.get("settings", {}))
                    await websocket.send_json({"type": "settings_ack"})

            else:
                if not session.api_key:
                    await websocket.send_json({"type": "error", "message": "Not initialized"})
                    continue
                logger.debug("Unhandled message type: %s", msg_type)

    except WebSocketDisconnect:
        logger.info("WebSocket connection closed")
