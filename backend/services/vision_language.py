"""VisionLanguageService — deep multimodal understanding of a captured object.

Produces the identification + material layer of the pipeline (spec stage 5).
"""
import logging
from typing import Optional

from services.llm import BaseLlm, extract_json

logger = logging.getLogger(__name__)

ANALYSIS_SYSTEM = """You are the vision-language core of EvoSnap, an AI spatial intelligence platform.
Analyze the primary object in the image and return ONLY a strict JSON object:

{
  "name": "<specific, precise name>",
  "category": "<one of: plant, product, landmark, object, animal, food, other>",
  "confidence": "<one of: low, medium, high>",
  "short_label": "<2-3 word AR tag>",
  "description": "<2-3 engaging sentences about what it is>",
  "usage": "<2-3 sentences on purpose / how it is used>",
  "material": "<primary material, e.g. 'PET plastic', 'anodized aluminium', 'organic matter'>",
  "materials": ["<material 1>", "<material 2>"],
  "physical_properties": "<1-2 sentences: durability, texture, weight class, notable properties>",
  "lifecycle": "<1-2 sentences: how it is produced, used and disposed of>",
  "recycling_category": "<e.g. 'PET #1 recyclable', 'e-waste', 'compostable', 'not recyclable', 'n/a (living organism)'>",
  "tags": ["<tag1>", "<tag2>", "<tag3>"]
}

Rules:
- Output ONLY valid JSON. No markdown fences, no commentary.
- If unsure, give your best guess with confidence "low".
- If no recognizable object, use name "Unknown Object", category "other", confidence "low".
- For living things (plants/animals), describe materials as their biological composition.
"""


class VisionLanguageService:
    def __init__(self, llm: BaseLlm):
        self._llm = llm

    async def analyze(self, image_b64: str, mode: str = "normal") -> dict:
        hint = f" The user is scanning in '{mode}' lens mode." if mode != "normal" else ""
        raw = await self._llm.generate(
            ANALYSIS_SYSTEM,
            f"Identify and analyze the primary object in this image.{hint} JSON only.",
            image_b64=image_b64,
        )
        try:
            data = extract_json(raw)
            if not isinstance(data, dict):
                raise ValueError("expected object")
        except ValueError:
            logger.warning("VLM returned non-JSON: %.300s", raw)
            data = {
                "name": "Unknown Object",
                "category": "other",
                "confidence": "low",
                "short_label": "Unknown",
                "description": raw[:300] if raw else "Could not identify the object.",
                "usage": "Try another angle or better lighting.",
            }
        return self._sanitize(data)

    @staticmethod
    def _sanitize(data: dict) -> dict:
        def s(key: str, limit: int = 600, default: str = "") -> str:
            return str(data.get(key) or default)[:limit]

        def lst(key: str, limit: int) -> list:
            val = data.get(key) or []
            return [str(x)[:80] for x in val][:limit] if isinstance(val, list) else []

        return {
            "name": s("name", 120, "Unknown Object"),
            "category": s("category", 20, "other").lower(),
            "confidence": s("confidence", 10, "low").lower(),
            "short_label": s("short_label", 40) or s("name", 40, "Unknown"),
            "description": s("description"),
            "usage": s("usage"),
            "material": s("material", 80),
            "materials": lst("materials", 5),
            "physical_properties": s("physical_properties", 400),
            "lifecycle": s("lifecycle", 400),
            "recycling_category": s("recycling_category", 80),
            "tags": lst("tags", 8),
        }
