from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import re
import logging
import uuid
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
MODEL_PROVIDER = "gemini"
MODEL_NAME = "gemini-3-flash-preview"

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ============ Models ============
class ScanCreate(BaseModel):
    image_base64: str  # pure base64 (no data: prefix)


class ChatTurn(BaseModel):
    role: str  # "user" | "assistant"
    text: str
    timestamp: str


class Scan(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category: str  # plant | product | landmark | object | animal | food | other
    confidence: str  # low | medium | high
    short_label: str  # tiny AR tag, 2-3 words
    description: str
    usage: str
    insights: List[str] = []
    tags: List[str] = []
    image_base64: str = ""  # stored for history thumbnail
    favorite: bool = False
    chat_history: List[ChatTurn] = []
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ChatRequest(BaseModel):
    message: str


# ============ Helpers ============
SCAN_SYSTEM_PROMPT = """You are OmniScan AR, an advanced object identification engine powering a futuristic AR scanning app.

When given an image, identify the primary object in focus and return ONLY a strict JSON object with these exact keys:
{
  "name": "<specific, precise name of the object>",
  "category": "<one of: plant, product, landmark, object, animal, food, other>",
  "confidence": "<one of: low, medium, high>",
  "short_label": "<2-3 word AR tag>",
  "description": "<2-3 sentence engaging description>",
  "usage": "<2-3 sentences on how it is used, its purpose, or relevance>",
  "insights": ["<interesting fact 1>", "<interesting fact 2>", "<interesting fact 3>"],
  "tags": ["<tag1>", "<tag2>", "<tag3>"]
}

Rules:
- Output ONLY valid JSON, no markdown fences, no commentary.
- If unsure, still provide the best guess with confidence "low".
- If no recognizable object, return name "Unknown Object", category "other", confidence "low".
- Always include 3 insights and 3 tags.
"""

CHAT_SYSTEM_PROMPT_TEMPLATE = """You are OmniScan AR's knowledge companion. The user has scanned: {name} (category: {category}).
Context about the object:
- Description: {description}
- Usage: {usage}
- Insights: {insights}

Answer the user's follow-up questions about this specific object concisely (2-4 sentences), factually, and engagingly. Stay focused on the scanned object and its domain."""


def _extract_json(text: str) -> dict:
    text = text.strip()
    # strip markdown fences
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    # find first {...}
    match = re.search(r'\{[\s\S]*\}', text)
    if not match:
        raise ValueError("No JSON object found in response")
    return json.loads(match.group(0))


def _doc_to_scan(doc: dict) -> dict:
    doc = {k: v for k, v in doc.items() if k != '_id'}
    return doc


# ============ Routes ============
@api_router.get("/")
async def root():
    return {"message": "OmniScan AR API", "status": "online"}


@api_router.post("/scan", response_model=Scan)
async def scan_object(payload: ScanCreate):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured")

    # strip data: prefix if present
    b64 = payload.image_base64
    if b64.startswith("data:"):
        b64 = b64.split(",", 1)[-1]

    session_id = f"scan-{uuid.uuid4()}"
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=SCAN_SYSTEM_PROMPT,
    ).with_model(MODEL_PROVIDER, MODEL_NAME)

    user_msg = UserMessage(
        text="Identify the primary object in this image. Respond with the JSON schema exactly.",
        file_contents=[ImageContent(image_base64=b64)],
    )

    try:
        response = await chat.send_message(user_msg)
    except Exception as e:
        logging.exception("LLM scan failed")
        raise HTTPException(status_code=502, detail=f"Scan failed: {str(e)}")

    try:
        data = _extract_json(response)
    except Exception:
        logging.warning(f"Malformed LLM response: {response[:500]}")
        data = {
            "name": "Unknown Object",
            "category": "other",
            "confidence": "low",
            "short_label": "Unknown",
            "description": response[:300] if response else "Could not identify.",
            "usage": "Please try another angle or better lighting.",
            "insights": ["Scan returned an unstructured result."],
            "tags": [],
        }

    scan = Scan(
        name=str(data.get("name", "Unknown Object"))[:120],
        category=str(data.get("category", "other")).lower(),
        confidence=str(data.get("confidence", "low")).lower(),
        short_label=str(data.get("short_label", data.get("name", "Unknown")))[:40],
        description=str(data.get("description", "")),
        usage=str(data.get("usage", "")),
        insights=[str(x) for x in (data.get("insights") or [])][:5],
        tags=[str(x) for x in (data.get("tags") or [])][:8],
        image_base64=b64,
    )

    await db.scans.insert_one(scan.model_dump())
    return scan


@api_router.get("/scans", response_model=List[Scan])
async def list_scans(category: Optional[str] = None, favorites_only: bool = False):
    query: dict = {}
    if category and category != "all":
        query["category"] = category
    if favorites_only:
        query["favorite"] = True

    # light payload: exclude full image to keep list fast
    cursor = db.scans.find(query, {"_id": 0, "image_base64": 0, "chat_history": 0}).sort("created_at", -1).limit(200)
    docs = await cursor.to_list(200)
    # Re-fill image_base64 as empty string since model requires it
    for d in docs:
        d.setdefault("image_base64", "")
        d.setdefault("chat_history", [])
    return [Scan(**d) for d in docs]


@api_router.get("/scans/{scan_id}", response_model=Scan)
async def get_scan(scan_id: str):
    doc = await db.scans.find_one({"id": scan_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Scan not found")
    return Scan(**doc)


@api_router.post("/scans/{scan_id}/favorite", response_model=Scan)
async def toggle_favorite(scan_id: str):
    doc = await db.scans.find_one({"id": scan_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Scan not found")
    new_fav = not bool(doc.get("favorite", False))
    await db.scans.update_one({"id": scan_id}, {"$set": {"favorite": new_fav}})
    doc["favorite"] = new_fav
    return Scan(**doc)


@api_router.delete("/scans/{scan_id}")
async def delete_scan(scan_id: str):
    result = await db.scans.delete_one({"id": scan_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Scan not found")
    return {"ok": True}


@api_router.post("/scans/{scan_id}/chat", response_model=Scan)
async def chat_about_scan(scan_id: str, req: ChatRequest):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured")

    doc = await db.scans.find_one({"id": scan_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Scan not found")

    history = doc.get("chat_history", [])
    system_msg = CHAT_SYSTEM_PROMPT_TEMPLATE.format(
        name=doc.get("name", "Unknown"),
        category=doc.get("category", "other"),
        description=doc.get("description", ""),
        usage=doc.get("usage", ""),
        insights=", ".join(doc.get("insights", []) or []),
    )

    # Use the scan_id as the session_id so Emergent integration keeps context across turns.
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"scan-chat-{scan_id}",
        system_message=system_msg,
    ).with_model(MODEL_PROVIDER, MODEL_NAME)

    try:
        response = await chat.send_message(UserMessage(text=req.message))
    except Exception as e:
        logging.exception("Chat failed")
        raise HTTPException(status_code=502, detail=f"Chat failed: {str(e)}")

    now = datetime.now(timezone.utc).isoformat()
    history.append({"role": "user", "text": req.message, "timestamp": now})
    history.append({"role": "assistant", "text": response, "timestamp": now})

    await db.scans.update_one({"id": scan_id}, {"$set": {"chat_history": history}})
    doc["chat_history"] = history
    return Scan(**doc)


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
