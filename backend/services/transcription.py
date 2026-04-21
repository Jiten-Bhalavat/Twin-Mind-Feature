import logging
from groq import Groq, APIError, RateLimitError, AuthenticationError

logger = logging.getLogger(__name__)

WHISPER_MODEL = "whisper-large-v3"


def transcribe_chunk(wav_bytes: bytes, api_key: str) -> str | None:
    """
    Send WAV bytes to Groq Whisper Large v3 and return transcript text.
    Returns None on failure so the caller can skip without crashing.
    """
    if not wav_bytes or len(wav_bytes) < 1000:
        logger.warning("WAV too small to transcribe (%d bytes)", len(wav_bytes or b""))
        return None

    try:
        client = Groq(api_key=api_key)
        response = client.audio.transcriptions.create(
            file=("chunk.wav", wav_bytes, "audio/wav"),
            model=WHISPER_MODEL,
            response_format="text",
            temperature=0.0,
        )
        # response is a plain string when response_format="text"
        text = response.strip() if isinstance(response, str) else response.text.strip()
        logger.info("Transcribed %d chars", len(text))
        return text if text else None

    except AuthenticationError:
        logger.error("Groq auth failed — invalid API key")
        return None
    except RateLimitError:
        logger.warning("Groq rate limit hit — skipping chunk")
        return None
    except APIError as e:
        logger.error("Groq API error: %s", e)
        return None
    except Exception as e:
        logger.error("Transcription unexpected error: %s", e)
        return None


def deduplicate_overlap(prev_text: str, new_text: str, max_overlap_words: int = 30) -> str:
    """
    Remove words from the start of new_text that already appear at the
    end of prev_text (artifact of the 5s recording overlap).
    Uses a sliding window to find the longest matching prefix/suffix.
    """
    if not prev_text or not new_text:
        return new_text

    prev_words = prev_text.split()
    new_words = new_text.split()

    # Check progressively shorter suffixes of prev against prefixes of new
    check_len = min(max_overlap_words, len(prev_words), len(new_words))
    for length in range(check_len, 0, -1):
        if prev_words[-length:] == new_words[:length]:
            deduped = " ".join(new_words[length:]).strip()
            logger.debug("Trimmed %d overlapping words from new chunk", length)
            return deduped

    return new_text
