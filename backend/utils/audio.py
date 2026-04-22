import base64
import os
import tempfile
import subprocess
import logging

logger = logging.getLogger(__name__)


def decode_and_convert(base64_data: str) -> bytes | None:
    """
    Decode a base64-encoded webm audio blob and convert it to 16kHz mono WAV bytes.
    Returns None if conversion fails.
    """
    try:
        audio_bytes = base64.b64decode(base64_data)
    except Exception as e:
        logger.error("Base64 decode failed: %s", e)
        return None

    if len(audio_bytes) < 100:
        logger.warning("Audio chunk too small (%d bytes), skipping", len(audio_bytes))
        return None

    with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as src_f:
        src_path = src_f.name
        src_f.write(audio_bytes)

    wav_path = src_path.replace('.webm', '.wav')

    try:
        result = subprocess.run(
            [
                'ffmpeg', '-y',
                '-i', src_path,
                '-ar', '16000',   # 16kHz — optimal for Whisper
                '-ac', '1',       # mono
                '-f', 'wav',
                wav_path,
            ],
            capture_output=True,
            timeout=30,
        )

        if result.returncode != 0:
            logger.error("ffmpeg error: %s", result.stderr.decode())
            return None

        with open(wav_path, 'rb') as f:
            return f.read()

    except FileNotFoundError:
        logger.error("ffmpeg not found — is it installed and on PATH?")
        return None
    except subprocess.TimeoutExpired:
        logger.error("ffmpeg conversion timed out")
        return None
    except Exception as e:
        logger.error("Audio conversion error: %s", e)
        return None
    finally:
        for path in (src_path, wav_path):
            try:
                os.unlink(path)
            except OSError:
                pass
