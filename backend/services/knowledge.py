"""KnowledgeService — LLM reasoning over the vision analysis (spec stage 6).

Generates the environmental/educational layer: explanation, sustainability
scores, carbon footprint, decomposition timeline, and grounded follow-up Q&A.
"""
import json
import logging
from typing import List

from services.llm import BaseLlm, extract_json

logger = logging.getLogger(__name__)

MODE_FOCUS = {
    "normal": "a balanced overview",
    "study": "educational depth: how it works, science behind it, key concepts a student should learn",
    "environmental": "environmental impact: emissions, pollution, decomposition, ecosystem effects",
    "shopping": "consumer angle: typical price range, quality signals, alternatives, buying advice",
    "nature": "its role in nature and ecosystems, related species or natural processes",
    "history": "its history: origin, evolution over time, cultural significance",
    "future": "how this object and its category will change over the coming decades",
}

KNOWLEDGE_SYSTEM = """You are the knowledge engine of OmniScan AR, an environmental-education AR platform.
You receive a JSON analysis of a scanned object. Reason over it and return ONLY a strict JSON object:

{
  "explanation": "<3-4 sentence deeper AI explanation of this object beyond the obvious>",
  "insights": ["<surprising fact 1>", "<fact 2>", "<fact 3>"],
  "sustainability_advice": "<2-3 actionable sentences: how to use/dispose of it responsibly>",
  "carbon_footprint": "<short estimate with units, e.g. '~82 g CO2e to produce one unit'>",
  "sustainability_score": <0-100, how sustainable this object is overall>,
  "recycling_score": <0-100, how recyclable/circular it is>,
  "decomposition_years": "<headline figure, e.g. '450+ years', '2-6 weeks', 'n/a (living)'>",
  "decomposition_timeline": [
    {"years": "10", "state": "<condition after 10 years in the environment>"},
    {"years": "25", "state": "..."},
    {"years": "50", "state": "..."},
    {"years": "100", "state": "..."},
    {"years": "250", "state": "..."},
    {"years": "500", "state": "..."}
  ],
  "environmental_impact": "<2-3 sentences on its impact on ecosystems if discarded>",
  "mode_focus": "<2-3 sentences tailored to the requested lens mode>"
}

Rules:
- Output ONLY valid JSON, no markdown fences.
- Estimates must be plausible and order-of-magnitude correct; say 'approximately'.
- For living organisms use scores reflecting their natural role (usually high) and mark
  decomposition as natural decay.
- Keep every timeline state under 15 words.
"""


class KnowledgeService:
    def __init__(self, llm: BaseLlm):
        self._llm = llm

    async def enrich(self, analysis: dict, mode: str = "normal") -> dict:
        focus = MODE_FOCUS.get(mode, MODE_FOCUS["normal"])
        user = (
            f"Lens mode: {mode.upper()} — emphasize {focus}.\n"
            f"Object analysis JSON:\n{json.dumps(analysis, ensure_ascii=False)}"
        )
        raw = await self._llm.generate(KNOWLEDGE_SYSTEM, user)
        try:
            data = extract_json(raw)
            if not isinstance(data, dict):
                raise ValueError("expected object")
        except ValueError:
            logger.warning("Knowledge LLM returned non-JSON: %.300s", raw)
            data = {}
        return self._sanitize(data)

    @staticmethod
    def _sanitize(data: dict) -> dict:
        def s(key: str, limit: int = 700) -> str:
            return str(data.get(key) or "")[:limit]

        def score(key: str) -> int:
            try:
                v = int(float(data.get(key)))
                return min(max(v, 0), 100)
            except (TypeError, ValueError):
                return -1

        timeline = []
        raw_tl = data.get("decomposition_timeline") or []
        if isinstance(raw_tl, list):
            for item in raw_tl[:8]:
                if isinstance(item, dict) and item.get("state"):
                    timeline.append({
                        "years": str(item.get("years", "?"))[:12],
                        "state": str(item["state"])[:120],
                    })

        insights = data.get("insights") or []
        insights = ([str(x)[:220] for x in insights][:5]
                    if isinstance(insights, list) else [])

        return {
            "explanation": s("explanation"),
            "insights": insights,
            "sustainability_advice": s("sustainability_advice"),
            "carbon_footprint": s("carbon_footprint", 120),
            "sustainability_score": score("sustainability_score"),
            "recycling_score": score("recycling_score"),
            "decomposition_years": s("decomposition_years", 60),
            "decomposition_timeline": timeline,
            "environmental_impact": s("environmental_impact"),
            "mode_focus": s("mode_focus"),
        }

    async def answer(self, scan: dict, history: List[dict], message: str) -> str:
        """Grounded Q&A about a specific scan, with conversation memory."""
        context = (
            f"Object: {scan.get('name')} (category: {scan.get('category')}, "
            f"material: {scan.get('material') or 'unknown'})\n"
            f"Description: {scan.get('description')}\n"
            f"Usage: {scan.get('usage')}\n"
            f"Environmental impact: {scan.get('environmental_impact')}\n"
            f"Insights: {', '.join(scan.get('insights') or [])}"
        )
        system = (
            "You are OmniScan AR's knowledge companion. The user scanned an object "
            "and is asking follow-up questions about it.\n\n"
            f"{context}\n\n"
            "Answer concisely (2-4 sentences), factually and engagingly. "
            "Stay focused on this object and its domain."
        )
        transcript = ""
        for turn in (history or [])[-12:]:
            speaker = "User" if turn.get("role") == "user" else "Assistant"
            transcript += f"{speaker}: {turn.get('text', '')}\n"
        user = (f"Conversation so far:\n{transcript}\nUser: {message}"
                if transcript else message)
        return await self._llm.generate(system, user)
