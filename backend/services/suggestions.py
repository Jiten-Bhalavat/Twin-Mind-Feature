import json
import logging
import uuid
from pathlib import Path
import yaml
from groq import Groq, APIError, RateLimitError, AuthenticationError

logger = logging.getLogger(__name__)

SUGGESTION_MODEL = "openai/gpt-oss-120b"

def _load_prompts() -> dict:
    path = Path(__file__).parent.parent / "prompts.yaml"
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)

_PROMPTS = _load_prompts()
DEFAULT_PROMPT: str = _PROMPTS["suggestions"]["default_prompt"].strip()


def build_context(transcript_chunks: list[dict], context_window: int) -> str:
    chunks = transcript_chunks[-context_window:] if context_window > 0 else transcript_chunks
    return "\n\n".join(c["text"] for c in chunks).strip()


def _call_llm(client: Groq, model: str, prompt: str) -> str | None:
    """Call the LLM and return raw text, or None on any failure."""
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=1,
            max_completion_tokens=1024,
            top_p=1,
            reasoning_effort="medium",
            stream=False,
            stop=None,
        )
        return response.choices[0].message.content.strip()
    except AuthenticationError:
        logger.error("Groq auth failed — check API key")
        return None
    except RateLimitError:
        logger.warning("Groq rate limit hit on model %s", model)
        return None
    except APIError as e:
        logger.warning("Groq API error on model %s: %s", model, e)
        return None
    except Exception as e:
        logger.error("LLM call failed on model %s: %s", model, e)
        return None


def generate_suggestions(
    transcript_chunks: list[dict],
    api_key: str,
    prompt_template: str = "",
    context_window: int = 5,
) -> list[dict] | None:
    """
    Generate 3 suggestions from recent transcript context.
    Returns a list of dicts with id, type, preview, detail_hint — or None on failure.
    """
    if not transcript_chunks:
        return None

    context = build_context(transcript_chunks, context_window)
    if not context:
        return None

    template = prompt_template.strip() or DEFAULT_PROMPT
    prompt = template.replace("{transcript}", context)

    client = Groq(api_key=api_key)
    raw = _call_llm(client, SUGGESTION_MODEL, prompt)
    if raw is None:
        logger.error("Model %s failed — no suggestions generated", SUGGESTION_MODEL)
        return None

    logger.debug("Raw LLM output: %s", raw[:200])

    # Strip markdown fences if the model wrapped the JSON anyway
    if "```" in raw:
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else raw
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    # Find JSON array boundaries in case there's extra text
    start = raw.find("[")
    end = raw.rfind("]") + 1
    if start != -1 and end > start:
        raw = raw[start:end]

    try:
        suggestions = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Malformed JSON — attempting repair. Raw: %s", raw[:300])
        suggestions = _repair_json(raw, client)
        if suggestions is None:
            return None

    if not isinstance(suggestions, list) or len(suggestions) == 0:
        logger.warning("Suggestions not a list: %s", suggestions)
        return None

    # Validate and stamp IDs — take up to 3
    valid = []
    for item in suggestions[:3]:
        if isinstance(item, dict) and "preview" in item:
            valid.append({
                "id": str(uuid.uuid4()),
                "type": item.get("type", "context"),
                "preview": str(item["preview"])[:300],
                "detail_hint": str(item.get("detail_hint", ""))[:300],
            })

    logger.info("Generated %d valid suggestions", len(valid))
    return valid if valid else None


def _repair_json(raw: str, client: Groq) -> list[dict] | None:
    """One retry asking the model to emit clean JSON from its broken output."""
    try:
        response = client.chat.completions.create(
            model=SUGGESTION_MODEL,
            messages=[{"role": "user", "content": f"Fix this broken JSON and return only a valid JSON array, nothing else:\n{raw}"}],
            temperature=1,
            max_completion_tokens=600,
            top_p=1,
            reasoning_effort="medium",
            stream=False,
            stop=None,
        )
        fixed = response.choices[0].message.content.strip()
        if "```" in fixed:
            fixed = fixed.split("```")[1].lstrip("json").strip()
        start = fixed.find("[")
        end = fixed.rfind("]") + 1
        if start != -1 and end > start:
            fixed = fixed[start:end]
        return json.loads(fixed)
    except Exception as e:
        logger.error("JSON repair failed: %s", e)
        return None
