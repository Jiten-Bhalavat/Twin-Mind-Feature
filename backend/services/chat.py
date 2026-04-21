import logging
from typing import AsyncGenerator
from groq import Groq, APIError, RateLimitError, AuthenticationError

logger = logging.getLogger(__name__)

CHAT_MODEL = "openai/gpt-oss-120b"

DEFAULT_CHAT_INSTRUCTIONS = "Be concise and direct. Answer in 3-4 sentences unless the question clearly needs more depth."


def build_transcript_context(transcript_chunks: list[dict], context_window: int = 0) -> str:
    chunks = transcript_chunks[-context_window:] if context_window > 0 else transcript_chunks
    if not chunks:
        return "(No transcript yet)"
    return "\n\n".join(c["text"] for c in chunks)


def _build_primer(instructions: str, transcript: str) -> list[dict]:
    """
    Inject transcript as a priming user/assistant exchange.
    Reasoning models reliably read context injected this way vs system messages.
    """
    instr = instructions.strip() or DEFAULT_CHAT_INSTRUCTIONS
    return [
        {
            "role": "user",
            "content": (
                f"[Meeting transcript — use this as context for all answers]\n\n"
                f"{transcript}\n\n"
                f"[Behavior instructions]\n{instr}"
            ),
        },
        {
            "role": "assistant",
            "content": "Understood. I have the full transcript and will use it to answer your questions.",
        },
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
