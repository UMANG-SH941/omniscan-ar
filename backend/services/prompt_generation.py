"""PromptGenerationService — builds geometry-preserving prompts for the
future-simulation image generator (spec stage 7).

Deterministic (no LLM round-trip): degradation cues are derived from the
object's material analysis, keeping the Future Vision timeline fast and cheap.
"""
from typing import List

FUTURE_STAGES: List[int] = [10, 25, 50, 100, 250, 500]

_MATERIAL_CUES = [
    (("plastic", "pet", "polymer", "nylon", "pvc", "polyethylene", "acrylic"),
     "UV yellowing and chalking, brittle micro-cracks, fragmented edges, "
     "faded print, embedded dirt, early microplastic flaking"),
    (("metal", "steel", "iron", "aluminium", "aluminum", "tin", "copper", "brass"),
     "surface oxidation and rust streaks, pitting, flaking coating, "
     "dull corroded patina, accumulated grime"),
    (("glass", "ceramic", "porcelain"),
     "surface weathering and iridescence, fine chips and cracks, "
     "sediment staining, moss in crevices"),
    (("wood", "bamboo", "paper", "cardboard", "cotton", "fabric", "leather", "wool"),
     "rot and fibrous decay, moss and fungal growth, warping, "
     "dark water staining, partial collapse into soil"),
    (("electronic", "circuit", "battery", "silicon", "e-waste"),
     "corroded contacts, swollen delaminated casing, faded screen, "
     "oxidized ports, dust ingress and cracked housing"),
    (("organic", "food", "plant", "leaf", "fruit", "biological"),
     "natural decomposition, browning and shriveling, mold colonies, "
     "gradual return to soil"),
    (("stone", "concrete", "brick", "marble"),
     "erosion and rounding of edges, lichen and moss coverage, "
     "hairline cracks, weather staining"),
]

_GENERIC_CUES = ("weathering, fading, accumulated dirt, structural wear, "
                 "gradual environmental degradation")


def _cues_for(material_text: str) -> str:
    m = material_text.lower()
    for keywords, cues in _MATERIAL_CUES:
        if any(k in m for k in keywords):
            return cues
    return _GENERIC_CUES


def _intensity(years: int) -> str:
    if years <= 10:
        return "early, subtle signs of"
    if years <= 25:
        return "clearly visible"
    if years <= 50:
        return "advanced"
    if years <= 100:
        return "severe"
    if years <= 250:
        return "extreme, near-total"
    return "almost complete disintegration with only remnants left:"


class PromptGenerationService:
    def build(self, scan: dict, years: int) -> str:
        name = scan.get("name") or "object"
        material = " ".join(
            [scan.get("material") or ""] + (scan.get("materials") or []))
        description = (scan.get("description") or "")[:220]
        cues = _cues_for(f"{material} {scan.get('category', '')} {name}")
        return (
            f"Edit the provided reference photo. Keep the IDENTICAL scene: same "
            f"camera angle, same framing, same background, same surface it rests "
            f"on, same lighting, same object position and scale. "
            f"Change ONLY the surface condition of the {name} "
            f"({material.strip() or 'unknown material'}) to show how it looks "
            f"after {years} years abandoned in place: {_intensity(years)} {cues}. "
            f"The object must stay unmistakably recognizable as the same item"
            + (f" ({description})" if description else "") + ". "
            "Photorealistic documentary photo, realistic textures, "
            "no text, no watermarks."
        )
