import logging
from pathlib import Path
from typing import AsyncGenerator
import yaml
from groq import Groq, APIError, RateLimitError, AuthenticationError

logger = logging.getLogger(__name__)

CHAT_MODEL = "openai/gpt-oss-120b"

def _load_prompts() -> dict:
    path = Path(__file__).parent.parent / "prompts.yaml"
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)

_PROMPTS = _load_prompts()
_PRIMER_USER_TEMPLATE: str = _PROMPTS["chat"]["primer_user_template"]
_PRIMER_ASSISTANT_ACK: str = _PROMPTS["chat"]["primer_assistant_ack"]


def build_transcript_context(transcript_chunks: list[dict], context_window: int = 0) -> str:
    chunks = transcript_chunks[-context_window:] if context_window > 0 else transcript_chunks
    if not chunks:
        return "(No transcript yet)"
    return "\n\n".join(c["text"] for c in chunks)


def _build_primer(instructions: str, transcript: str) -> list[dict]:
    if instructions.strip():
        # User's custom prompt fully replaces the template
        user_content = instructions.strip() + "\n\n### TRANSCRIPT:\n" + transcript
    else:
        user_content = _PRIMER_USER_TEMPLATE.format(transcript=transcript)
    return [
        {"role": "user", "content": user_content},
        {"role": "assistant", "content": _PRIMER_ASSISTANT_ACK},
    ]


async def stream_chat_response(
    messages: list[dict],
    transcript_chunks: list[dict],
    api_key: str,
    chat_instructions: str = "",
    context_window: int = 0,
) -> AsyncGenerator[str, None]:
    """
    Stream a chat response. Handles both free-typed messages and suggestion clicks —
    the caller just passes the user message, this function handles context injection.
    """
    transcript = build_transcript_context(transcript_chunks, context_window)
    full_messages = _build_primer(chat_instructions, transcript) + messages

    try:
        client = Groq(api_key=api_key)
        stream = client.chat.completions.create(
            model=CHAT_MODEL,
            messages=full_messages,
            temperature=1,
            max_completion_tokens=2048,
            top_p=1,
            reasoning_effort="medium",
            stream=True,
            stop=None,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    except AuthenticationError:
        logger.error("Groq auth failed for chat")
        yield "\n\n[Error: Invalid API key]"
    except RateLimitError:
        logger.warning("Groq rate limit hit during chat")
        yield "\n\n[Error: Rate limit reached — try again shortly]"
    except APIError as e:
        logger.error("Groq API error (chat): %s", e)
        yield f"\n\n[Error: {e}]"
    except Exception as e:
        logger.error("Chat stream error: %s", e)
        yield "\n\n[Error: Unexpected failure]"
