"""DetectionService — real-time multi-object detection.

Uses the VLM's spatial grounding to return labelled bounding boxes for every
distinct object in a frame. The frontend calls this in a tight loop while the
AR HUD is live and does its own tracking/smoothing on top.

Replaceable: swap this class for a YOLO/RT-DETR microservice without touching
the API layer — it only needs to return the same DetectedObject list.
"""
import logging
from typing import List

from models import DetectedObject
from services.llm import BaseLlm, LlmError, extract_json

logger = logging.getLogger(__name__)

DETECTION_SYSTEM = """You are a real-time object detector for an AR scanner.
Given a camera frame, detect up to 6 distinct, clearly visible physical objects.

Return ONLY a JSON array, no markdown, in this exact shape:
[
  {"label": "<1-3 word object name>", "box_2d": [ymin, xmin, ymax, xmax], "confidence": <0.0-1.0>}
]

Rules:
- box_2d values are integers 0-1000, normalized to the image.
- Boxes must tightly fit each object.
- Skip walls, floors, sky and other background surfaces.
- If nothing recognizable is visible, return [].
"""


class DetectionService:
    def __init__(self, llm: BaseLlm):
        self._llm = llm

    async def detect(self, image_b64: str) -> List[DetectedObject]:
        raw = await self._llm.generate(
            DETECTION_SYSTEM,
            "Detect the objects in this frame. JSON array only.",
            image_b64=image_b64,
        )
        try:
            data = extract_json(raw)
        except ValueError:
            logger.warning("Detector returned non-JSON: %.200s", raw)
            return []
        if not isinstance(data, list):
            return []

        objects: List[DetectedObject] = []
        for item in data[:6]:
            try:
                ymin, xmin, ymax, xmax = [float(v) / 1000.0 for v in item["box_2d"]]
            except (KeyError, TypeError, ValueError):
                continue
            x = min(max(xmin, 0.0), 1.0)
            y = min(max(ymin, 0.0), 1.0)
            w = min(max(xmax - xmin, 0.0), 1.0 - x)
            h = min(max(ymax - ymin, 0.0), 1.0 - y)
            if w < 0.01 or h < 0.01:
                continue
            try:
                conf = float(item.get("confidence", 0.5))
            except (TypeError, ValueError):
                conf = 0.5
            objects.append(DetectedObject(
                label=str(item.get("label", "object"))[:40],
                confidence=min(max(conf, 0.0), 1.0),
                box=[x, y, w, h],
            ))
        return objects
