import logging
from pathlib import Path
import yaml
from groq import Groq, APIError, RateLimitError, AuthenticationError

logger = logging.getLogger(__name__)

SUMMARY_MODEL = "openai/gpt-oss-120b"
SUMMARY_THRESHOLD = 20   # summarize when chunk count exceeds this
SUMMARY_BATCH = 10       # number of oldest chunks to collapse each time


def _load_prompt() -> str:
    path = Path(__file__).parent.parent / "prompts.yaml"
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data["summarizer"]["prompt"].strip()


def summarize_chunks(chunks: list[dict], api_key: str) -> str | None:
    prompt_template = _load_prompt()
    transcript = "\n\n".join(c["text"] for c in chunks)
    prompt = prompt_template.replace("{transcript}", transcript)

    try:
        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model=SUMMARY_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=1,
            max_completion_tokens=512,
            top_p=1,
            reasoning_effort="medium",
            stream=False,
            stop=None,
        )
        summary = response.choices[0].message.content.strip()
        logger.info("Summarized %d chunks into %d chars", len(chunks), len(summary))
        return summary
    except AuthenticationError:
        logger.error("Groq auth failed during summarization")
        return None
    except RateLimitError:
        logger.warning("Groq rate limit hit during summarization")
        return None
    except (APIError, Exception) as e:
        logger.error("Summarization failed: %s", e)
        return None


async def maybe_summarize(session, loop) -> None:
    """
    If transcript exceeds SUMMARY_THRESHOLD, collapse the oldest SUMMARY_BATCH
    chunks into a single summary chunk in place.
    Runs in an executor so it doesn't block the event loop.
    """
    if len(session.transcript_chunks) <= SUMMARY_THRESHOLD:
        return

    to_summarize = session.transcript_chunks[:SUMMARY_BATCH]
    summary_text = await loop.run_in_executor(
        None, summarize_chunks, to_summarize, session.api_key
    )

    if not summary_text:
        return

    summary_chunk = {
        "text": summary_text,
        "timestamp": to_summarize[0]["timestamp"],
        "is_summary": True,
    }

    session.transcript_chunks = [summary_chunk] + session.transcript_chunks[SUMMARY_BATCH:]
    logger.info(
        "Rolling summary applied — collapsed %d chunks, transcript now %d chunks",
        SUMMARY_BATCH,
        len(session.transcript_chunks),
    )
