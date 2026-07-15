"""MaterialClassifierService — serves our self-trained model (see research/).

Runs the MobileNetV3 material classifier (fine-tuned on TrashNet by
research/train_material_classifier.py) on every deep scan, fully locally via
ONNX Runtime. Its prediction is attached to the scan as a second, independent
opinion next to the vision-language model — and degrades gracefully to a
no-op when the model or its dependencies are absent.
"""
import base64
import io
import json
import logging
import math
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

MODEL_DIR = Path(__file__).resolve().parent.parent.parent / "research" / "models"
MODEL_PATH = MODEL_DIR / "material_classifier.onnx"
LABELS_PATH = MODEL_DIR / "labels.json"

try:
    import numpy as np
    import onnxruntime as ort
    from PIL import Image
    DEPS_OK = True
except ImportError:
    DEPS_OK = False

IMG_SIZE = 224
MEAN = [0.485, 0.456, 0.406]
STD = [0.229, 0.224, 0.225]


class MaterialClassifierService:
    def __init__(self):
        self._session = None
        self._labels: list = []
        if not DEPS_OK:
            logger.info("Material classifier: onnxruntime/pillow not installed — disabled")
            return
        if not (MODEL_PATH.exists() and LABELS_PATH.exists()):
            logger.info("Material classifier: no trained model at %s — disabled "
                        "(run research/train_material_classifier.py)", MODEL_PATH)
            return
        try:
            self._session = ort.InferenceSession(
                str(MODEL_PATH), providers=["CPUExecutionProvider"])
            self._labels = json.loads(LABELS_PATH.read_text(encoding="utf-8"))
            logger.info("Material classifier loaded: %s classes %s",
                        len(self._labels), self._labels)
        except Exception as e:
            logger.warning("Material classifier failed to load: %s", e)
            self._session = None

    @property
    def available(self) -> bool:
        return self._session is not None

    def classify(self, image_b64: str) -> Optional[dict]:
        """Return {'label': str, 'confidence': float} or None."""
        if not self.available:
            return None
        try:
            img = Image.open(io.BytesIO(base64.b64decode(image_b64))).convert("RGB")
            # center-crop to square, resize to model input
            w, h = img.size
            s = min(w, h)
            img = img.crop(((w - s) // 2, (h - s) // 2,
                            (w + s) // 2, (h + s) // 2)).resize((IMG_SIZE, IMG_SIZE))
            x = np.asarray(img, dtype=np.float32) / 255.0
            x = (x - np.array(MEAN, dtype=np.float32)) / np.array(STD, dtype=np.float32)
            x = x.transpose(2, 0, 1)[None, ...]  # NCHW
            logits = self._session.run(None, {"image": x})[0][0]
            # softmax
            exp = [math.exp(v - max(logits)) for v in logits]
            probs = [v / sum(exp) for v in exp]
            best = int(np.argmax(probs))
            return {"label": self._labels[best],
                    "confidence": round(float(probs[best]), 4)}
        except Exception as e:
            logger.warning("Material classification failed: %s", e)
            return None
