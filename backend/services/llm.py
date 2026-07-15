"""Provider-agnostic LLM gateway.

Every AI service in the pipeline talks to a BaseLlm, never to a vendor SDK.
Two interchangeable backends, both free:

- GeminiLlm — direct REST calls to the Google Generative Language API using
  GEMINI_API_KEY (free tier at https://aistudio.google.com/apikey).
- OllamaLlm — fully open-source local inference via Ollama
  (https://ollama.com) with a vision model such as qwen2.5vl or gemma3.
  Select with LLM_PROVIDER=ollama (and optionally OLLAMA_URL / OLLAMA_MODEL).
"""
import json
import logging
import os
import re
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "").lower()  # "", "openai", "gemini", "ollama"
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5vl:7b")


class LlmUnavailable(Exception):
    """No LLM backend is configured/reachable."""


class LlmError(Exception):
    """The LLM call itself failed."""


def extract_json(text: str) -> Any:
    """Pull the first JSON object or array out of an LLM response."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    for opener, closer in (("{", "}"), ("[", "]")):
        start = text.find(opener)
        if start == -1:
            continue
        end = text.rfind(closer)
        if end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                continue
    raise ValueError("No JSON found in LLM response")


class BaseLlm:
    name = "base"
    model = ""

    async def generate(self, system: str, user_text: str,
                       image_b64: Optional[str] = None) -> str:
        raise NotImplementedError


class OpenAiLlm(BaseLlm):
    name = "openai"

    def __init__(self, model: str = OPENAI_MODEL):
        self.model = model

    async def generate(self, system: str, user_text: str,
                       image_b64: Optional[str] = None) -> str:
        content: list = [{"type": "text", "text": user_text}]
        if image_b64:
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
            })
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": content},
            ],
        }
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                    json=body)
                resp.raise_for_status()
                data = resp.json()
            return data["choices"][0]["message"]["content"]
        except httpx.HTTPStatusError as e:
            detail = ""
            try:
                detail = e.response.json().get("error", {}).get("code", "")
            except Exception:
                pass
            raise LlmError(f"OpenAI call failed ({e.response.status_code} {detail})") from e
        except (httpx.HTTPError, KeyError, IndexError) as e:
            raise LlmError(f"OpenAI call failed: {e}") from e


class FallbackLlm(BaseLlm):
    """Tries providers in order; the first success wins.

    Lets a primary provider without quota (or mid-outage) degrade silently
    to the next one instead of failing the request.
    """

    def __init__(self, chain: list):
        self._chain = chain
        self.name = "→".join(p.name for p in chain)
        self.model = " / ".join(getattr(p, "model", "") for p in chain)

    async def generate(self, system: str, user_text: str,
                       image_b64: Optional[str] = None) -> str:
        last: Optional[Exception] = None
        for provider in self._chain:
            try:
                return await provider.generate(system, user_text, image_b64)
            except LlmError as e:
                logger.warning("LLM %s failed (%s); trying next", provider.name, e)
                last = e
        raise LlmError(f"All LLM providers failed. Last: {last}")


class GeminiLlm(BaseLlm):
    name = "gemini-rest"

    def __init__(self, model: str = GEMINI_MODEL):
        self.model = model

    async def generate(self, system: str, user_text: str,
                       image_b64: Optional[str] = None) -> str:
        parts: list = [{"text": user_text}]
        if image_b64:
            parts.append({
                "inline_data": {"mime_type": "image/jpeg", "data": image_b64},
            })
        body = {
            "system_instruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": parts}],
        }
        url = f"{GEMINI_BASE}/models/{self.model}:generateContent"
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    url, params={"key": GEMINI_API_KEY}, json=body)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPError as e:
            raise LlmError(f"Gemini REST call failed: {e}") from e

        try:
            cand_parts = data["candidates"][0]["content"]["parts"]
            return "".join(p.get("text", "") for p in cand_parts)
        except (KeyError, IndexError) as e:
            raise LlmError(f"Unexpected Gemini response shape: {data}") from e


class OllamaLlm(BaseLlm):
    """Open-source local inference. Requires a vision-capable model, e.g.:

        ollama pull qwen2.5vl:7b     (best at bounding boxes)
        ollama pull gemma3:4b        (lighter alternative)
    """
    name = "ollama"

    def __init__(self, base_url: str = OLLAMA_URL, model: str = OLLAMA_MODEL):
        self._base = base_url.rstrip("/")
        self.model = model

    async def generate(self, system: str, user_text: str,
                       image_b64: Optional[str] = None) -> str:
        user_msg: dict = {"role": "user", "content": user_text}
        if image_b64:
            user_msg["images"] = [image_b64]
        body = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, user_msg],
            "stream": False,
        }
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                resp = await client.post(f"{self._base}/api/chat", json=body)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPError as e:
            raise LlmError(
                f"Ollama call failed ({self._base}, model {self.model}): {e}. "
                f"Is Ollama running and the model pulled?") from e
        try:
            return data["message"]["content"]
        except KeyError as e:
            raise LlmError(f"Unexpected Ollama response shape: {data}") from e


_llm: Optional[BaseLlm] = None


def get_llm() -> BaseLlm:
    global _llm
    if _llm is None:
        if LLM_PROVIDER == "ollama":
            _llm = OllamaLlm()
        elif LLM_PROVIDER == "gemini":
            if not GEMINI_API_KEY:
                raise LlmUnavailable("LLM_PROVIDER=gemini but GEMINI_API_KEY is not set")
            _llm = GeminiLlm()
        elif LLM_PROVIDER == "openai":
            if not OPENAI_API_KEY:
                raise LlmUnavailable("LLM_PROVIDER=openai but OPENAI_API_KEY is not set")
            _llm = OpenAiLlm()
        else:
            # Auto mode: OpenAI first when configured, Gemini as fallback.
            chain: list = []
            if OPENAI_API_KEY:
                chain.append(OpenAiLlm())
            if GEMINI_API_KEY:
                chain.append(GeminiLlm())
            if not chain:
                raise LlmUnavailable(
                    "No LLM configured. Set OPENAI_API_KEY and/or GEMINI_API_KEY "
                    "in backend/.env (Gemini is free at "
                    "https://aistudio.google.com/apikey), or run Ollama locally "
                    "and set LLM_PROVIDER=ollama (open source, https://ollama.com).")
            _llm = chain[0] if len(chain) == 1 else FallbackLlm(chain)
        logger.info("LLM backend: %s (%s)", _llm.name, _llm.model)
    return _llm


def llm_status() -> dict:
    try:
        llm = get_llm()
        return {"available": True, "backend": llm.name, "model": llm.model}
    except LlmUnavailable as e:
        return {"available": False, "backend": None, "detail": str(e)}
