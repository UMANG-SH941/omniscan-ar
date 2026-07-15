"""EvoSnap — AI Spatial Intelligence Platform API.

Thin route layer; all intelligence lives in independently replaceable services
(see backend/services/). Pipeline per the spec:

frame → DetectionService (live AR boxes)
photo → VisionLanguageService → KnowledgeService (deep scan)
scan  → PromptGenerationService → ImageGenerationService (future simulation)
"""
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException
from pathlib import Path
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')  # must run before services read env vars

from models import (  # noqa: E402
    ChatRequest, DetectRequest, DetectResponse, FutureRequest, FutureResponse,
    HealthResponse, Scan, ScanCreate,
)
from services.detection import DetectionService  # noqa: E402
from services.image_generation import (  # noqa: E402
    ImageGenError, ImageGenUnavailable, ImageGenerationService,
)
from services.knowledge import KnowledgeService  # noqa: E402
from services.llm import LlmError, LlmUnavailable, get_llm, llm_status  # noqa: E402
from services.material_classifier import MaterialClassifierService  # noqa: E402
from services.prompt_generation import FUTURE_STAGES, PromptGenerationService  # noqa: E402
from services.storage import ScanRepository, create_repository  # noqa: E402
from services.vision_language import VisionLanguageService  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger(__name__)

repo: Optional[ScanRepository] = None
image_gen = ImageGenerationService()
prompt_gen = PromptGenerationService()
material_clf = MaterialClassifierService()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global repo
    repo = await create_repository()
    yield
    close = getattr(repo, "close", None)
    if close:
        close()


app = FastAPI(title="EvoSnap", lifespan=lifespan)
api_router = APIRouter(prefix="/api")


def _strip_data_prefix(b64: str) -> str:
    return b64.split(",", 1)[-1] if b64.startswith("data:") else b64


def _services():
    """Build LLM-backed services lazily so a missing key fails per-request."""
    try:
        llm = get_llm()
    except LlmUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    return (DetectionService(llm), VisionLanguageService(llm),
            KnowledgeService(llm))


@api_router.get("/")
async def root():
    return {"message": "EvoSnap API", "status": "online"}


@api_router.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="online",
        llm=llm_status(),
        image_generation=image_gen.status(),
        storage=repo.name if repo else "initializing",
    )


@api_router.post("/detect", response_model=DetectResponse)
async def detect_objects(payload: DetectRequest):
    detection, _, _ = _services()
    b64 = _strip_data_prefix(payload.image_base64)
    try:
        objects = await detection.detect(b64)
    except LlmError as e:
        raise HTTPException(status_code=502, detail=f"Detection failed: {e}")
    return DetectResponse(objects=objects, count=len(objects))


@api_router.post("/scan", response_model=Scan)
async def scan_object(payload: ScanCreate):
    _, vision, knowledge = _services()
    b64 = _strip_data_prefix(payload.image_base64)
    mode = (payload.mode or "normal").lower()

    try:
        analysis = await vision.analyze(b64, mode=mode)
        enrichment = await knowledge.enrich(analysis, mode=mode)
    except LlmError as e:
        logger.exception("Scan pipeline failed")
        raise HTTPException(status_code=502, detail=f"Scan failed: {e}")

    # Second opinion from our self-trained material classifier (research/)
    ml = material_clf.classify(b64)
    ml_fields = ({"ml_material": ml["label"], "ml_confidence": ml["confidence"]}
                 if ml else {})

    scan = Scan(**analysis, **enrichment, **ml_fields, mode=mode, image_base64=b64)
    await repo.insert(scan.model_dump())
    return scan


@api_router.get("/scans", response_model=List[Scan])
async def list_scans(category: Optional[str] = None, favorites_only: bool = False):
    docs = await repo.list(category=category, favorites_only=favorites_only)
    return [Scan(**d) for d in docs]


@api_router.get("/scans/{scan_id}", response_model=Scan)
async def get_scan(scan_id: str):
    doc = await repo.get(scan_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Scan not found")
    return Scan(**doc)


@api_router.post("/scans/{scan_id}/favorite", response_model=Scan)
async def toggle_favorite(scan_id: str):
    doc = await repo.get(scan_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Scan not found")
    doc["favorite"] = not bool(doc.get("favorite", False))
    await repo.update(scan_id, {"favorite": doc["favorite"]})
    return Scan(**doc)


@api_router.delete("/scans/{scan_id}")
async def delete_scan(scan_id: str):
    if not await repo.delete(scan_id):
        raise HTTPException(status_code=404, detail="Scan not found")
    return {"ok": True}


@api_router.post("/scans/{scan_id}/chat", response_model=Scan)
async def chat_about_scan(scan_id: str, req: ChatRequest):
    _, _, knowledge = _services()
    doc = await repo.get(scan_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Scan not found")

    history = doc.get("chat_history", [])
    try:
        answer = await knowledge.answer(doc, history, req.message)
    except LlmError as e:
        raise HTTPException(status_code=502, detail=f"Chat failed: {e}")

    now = datetime.now(timezone.utc).isoformat()
    history.append({"role": "user", "text": req.message, "timestamp": now})
    history.append({"role": "assistant", "text": answer, "timestamp": now})
    await repo.update(scan_id, {"chat_history": history})
    doc["chat_history"] = history
    return Scan(**doc)


@api_router.post("/scans/{scan_id}/future", response_model=FutureResponse)
async def generate_future(scan_id: str, req: FutureRequest):
    if req.years not in FUTURE_STAGES:
        raise HTTPException(
            status_code=422,
            detail=f"years must be one of {FUTURE_STAGES}")

    doc = await repo.get(scan_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Scan not found")

    prompt = prompt_gen.build(doc, req.years)
    cached = (doc.get("future_images") or {}).get(str(req.years))
    if cached:
        return FutureResponse(years=req.years, image_base64=cached,
                              prompt=prompt, provider="cache", cached=True)

    try:
        image_b64, provider = await image_gen.generate(
            prompt, reference_b64=doc.get("image_base64") or None)
    except ImageGenUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ImageGenError as e:
        raise HTTPException(status_code=502, detail=str(e))

    futures = doc.get("future_images") or {}
    futures[str(req.years)] = image_b64
    await repo.update(scan_id, {"future_images": futures})
    return FutureResponse(years=req.years, image_base64=image_b64,
                          prompt=prompt, provider=provider)


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
