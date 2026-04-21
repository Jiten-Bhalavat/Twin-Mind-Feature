from pydantic import BaseModel
from typing import Optional


class IncomingMessage(BaseModel):
    type: str
    api_key: Optional[str] = None
    data: Optional[str] = None
    content: Optional[str] = None


class TranscriptChunk(BaseModel):
    text: str
    timestamp: str


class Suggestion(BaseModel):
    id: str
    type: str
    preview: str
    detail_hint: str


class SuggestionBatch(BaseModel):
    timestamp: str
    suggestions: list[Suggestion]


class ChatMessage(BaseModel):
    role: str
    content: str
    timestamp: str
