"""Pydantic schemas shared across the OmniScan AR API."""
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ChatTurn(BaseModel):
    role: str  # "user" | "assistant"
    text: str
    timestamp: str


class DecompositionStage(BaseModel):
    years: str  # e.g. "10", "100", "1-2"
    state: str  # what the object looks like at that point


class Scan(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))

    # Identification (VisionLanguageService)
    name: str = "Unknown Object"
    category: str = "other"  # plant | product | landmark | object | animal | food | other
    confidence: str = "low"  # low | medium | high
    short_label: str = "Unknown"
    description: str = ""
    usage: str = ""
    material: str = ""
    materials: List[str] = []
    physical_properties: str = ""
    lifecycle: str = ""
    recycling_category: str = ""
    tags: List[str] = []

    # Knowledge layer (KnowledgeService)
    explanation: str = ""
    insights: List[str] = []
    sustainability_advice: str = ""
    carbon_footprint: str = ""
    sustainability_score: int = -1  # 0-100, -1 = unknown
    recycling_score: int = -1  # 0-100, -1 = unknown
    decomposition_years: str = ""
    decomposition_timeline: List[DecompositionStage] = []
    environmental_impact: str = ""

    # Lens mode used at scan time + mode-specific commentary
    mode: str = "normal"
    mode_focus: str = ""

    # Prediction from our self-trained material classifier (research/)
    ml_material: str = ""
    ml_confidence: float = -1.0

    # Media
    image_base64: str = ""
    # future simulation images keyed by years-in-the-future ("10", "100", ...)
    future_images: Dict[str, str] = {}

    favorite: bool = False
    chat_history: List[ChatTurn] = []
    created_at: str = Field(default_factory=_now_iso)


class ScanCreate(BaseModel):
    image_base64: str  # base64 jpeg/png, with or without data: prefix
    mode: str = "normal"


class DetectRequest(BaseModel):
    image_base64: str


class DetectedObject(BaseModel):
    label: str
    confidence: float = 0.5
    # normalized [x, y, w, h], all in 0..1 relative to the submitted frame
    box: List[float]


class DetectResponse(BaseModel):
    objects: List[DetectedObject] = []
    count: int = 0


class ChatRequest(BaseModel):
    message: str


class FutureRequest(BaseModel):
    years: int  # one of 10, 25, 50, 100, 250, 500
    force: bool = False  # regenerate even if a cached image exists


class FutureResponse(BaseModel):
    years: int
    image_base64: str
    prompt: str
    provider: str
    cached: bool = False


class HealthResponse(BaseModel):
    status: str
    llm: Dict[str, object]
    image_generation: Dict[str, object]
    storage: str
