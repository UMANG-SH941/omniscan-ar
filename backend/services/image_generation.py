"""ImageGenerationService — pluggable AI image generation (spec stage 8).

Providers are tried in priority order; each is independently replaceable.

- StableDiffusionProvider — fully open source, self-hosted AUTOMATIC1111
  Stable Diffusion WebUI (https://github.com/AUTOMATIC1111/stable-diffusion-webui,
  run with --api). img2img keeps the object's geometry/perspective.
  Enable by setting SD_WEBUI_URL (e.g. http://127.0.0.1:7860).
- GeminiImageProvider — Google's image model on the free tier; image-to-image
  editing, so geometry/perspective survive. Needs GEMINI_API_KEY.
- OpenAIImageProvider — optional paid fallback (gpt-image-1). Needs OPENAI_API_KEY.
"""
import asyncio
import logging
import os
from typing import List, Optional

import httpx

logger = logging.getLogger(__name__)

SD_WEBUI_URL = os.environ.get("SD_WEBUI_URL", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_IMAGE_MODEL = os.environ.get("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")


class ImageGenError(Exception):
    pass


class ImageGenUnavailable(Exception):
    pass


class ImageGenProvider:
    name = "base"

    def available(self) -> bool:
        return False

    async def generate(self, prompt: str,
                       reference_b64: Optional[str] = None) -> str:
        """Return base64 image data."""
        raise NotImplementedError


class StableDiffusionProvider(ImageGenProvider):
    """AUTOMATIC1111 WebUI API. img2img when a reference photo is available."""
    name = "stable-diffusion"

    def __init__(self, base_url: str = SD_WEBUI_URL):
        self._base = base_url.rstrip("/")

    def available(self) -> bool:
        return bool(self._base)

    async def generate(self, prompt: str,
                       reference_b64: Optional[str] = None) -> str:
        common = {
            "prompt": prompt,
            "negative_prompt": "text, watermark, cartoon, illustration, low quality",
            "steps": 28,
            "width": 768,
            "height": 768,
        }
        if reference_b64:
            endpoint = f"{self._base}/sdapi/v1/img2img"
            body = {**common, "init_images": [reference_b64],
                    "denoising_strength": 0.6}
        else:
            endpoint = f"{self._base}/sdapi/v1/txt2img"
            body = common
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                resp = await client.post(endpoint, json=body)
                resp.raise_for_status()
                data = resp.json()
            images = data.get("images") or []
            if not images:
                raise ImageGenError("Stable Diffusion returned no images")
            # WebUI may return "data:image/png;base64,..." or bare base64
            return images[0].split(",", 1)[-1]
        except httpx.HTTPError as e:
            raise ImageGenError(
                f"Stable Diffusion call failed ({self._base}): {e}. "
                f"Is the WebUI running with --api?") from e


class GeminiImageProvider(ImageGenProvider):
    name = "gemini-image"

    def available(self) -> bool:
        return bool(GEMINI_API_KEY)

    async def generate(self, prompt: str,
                       reference_b64: Optional[str] = None) -> str:
        parts: list = [{"text": prompt}]
        if reference_b64:
            parts.append({
                "inline_data": {"mime_type": "image/jpeg", "data": reference_b64},
            })
        body = {
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
        }
        url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
               f"{GEMINI_IMAGE_MODEL}:generateContent")
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(url, params={"key": GEMINI_API_KEY}, json=body)
                if resp.status_code == 429:
                    raise ImageGenError(
                        "Gemini image model is rate-limited on the free tier — "
                        "wait a minute before generating again")
                resp.raise_for_status()
                data = resp.json()
        except ImageGenError:
            raise
        except httpx.HTTPError as e:
            raise ImageGenError(f"Gemini image call failed: {e}") from e

        for part in (data.get("candidates") or [{}])[0].get("content", {}).get("parts", []):
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                return inline["data"]
        raise ImageGenError("Gemini returned no image data")


class PollinationsProvider(ImageGenProvider):
    """Free, keyless text-to-image API (https://pollinations.ai).

    No img2img, so geometry preservation relies on the prompt alone — used as
    the always-available fallback when Gemini's free tier is rate-limited.
    """
    name = "pollinations"

    def available(self) -> bool:
        return True

    async def generate(self, prompt: str,
                       reference_b64: Optional[str] = None) -> str:
        import base64
        from urllib.parse import quote
        url = (f"https://image.pollinations.ai/prompt/{quote(prompt[:900])}"
               f"?width=768&height=768&nologo=true")
        try:
            async with httpx.AsyncClient(timeout=180.0, follow_redirects=True) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                if not resp.headers.get("content-type", "").startswith("image/"):
                    raise ImageGenError("Pollinations returned no image")
                return base64.b64encode(resp.content).decode("utf-8")
        except httpx.HTTPError as e:
            raise ImageGenError(f"Pollinations call failed: {e}") from e


class OpenAIImageProvider(ImageGenProvider):
    name = "openai-images"

    def available(self) -> bool:
        return bool(OPENAI_API_KEY)

    async def generate(self, prompt: str,
                       reference_b64: Optional[str] = None) -> str:
        body = {"model": "gpt-image-1", "prompt": prompt, "size": "1024x1024"}
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/images/generations",
                    headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                    json=body,
                )
                resp.raise_for_status()
                data = resp.json()
            return data["data"][0]["b64_json"]
        except (httpx.HTTPError, KeyError, IndexError) as e:
            raise ImageGenError(f"OpenAI image call failed: {e}") from e


class ImageGenerationService:
    def __init__(self, providers: Optional[List[ImageGenProvider]] = None):
        # Open-source/self-hosted first, then free-tier hosted (Gemini does
        # img2img so it leads), then keyless fallback, then paid.
        self._providers = providers or [
            StableDiffusionProvider(),
            GeminiImageProvider(),
            PollinationsProvider(),
            OpenAIImageProvider(),
        ]

    def available_providers(self) -> List[str]:
        return [p.name for p in self._providers if p.available()]

    def status(self) -> dict:
        return {
            "available": bool(self.available_providers()),
            "providers": self.available_providers(),
        }

    async def generate(self, prompt: str,
                       reference_b64: Optional[str] = None) -> tuple[str, str]:
        """Try providers in order. Returns (image_b64, provider_name)."""
        active = [p for p in self._providers if p.available()]
        if not active:
            raise ImageGenUnavailable(
                "No image generation provider configured. Set SD_WEBUI_URL "
                "(open-source Stable Diffusion WebUI), GEMINI_API_KEY "
                "(free tier), or OPENAI_API_KEY.")
        last_err: Optional[Exception] = None
        for provider in active:
            try:
                img = await provider.generate(prompt, reference_b64)
                return img, provider.name
            except ImageGenError as e:
                logger.warning("Provider %s failed: %s", provider.name, e)
                last_err = e
                # Gemini is the only provider that sees the reference photo
                # (image-to-image). When it is merely rate-limited, waiting out
                # the per-minute window beats falling back to text-to-image,
                # which invents a different scene.
                if (provider.name == "gemini-image" and reference_b64
                        and "rate-limited" in str(e)):
                    logger.info("Waiting 30s to retry Gemini img2img before "
                                "text-only fallback")
                    await asyncio.sleep(30)
                    try:
                        img = await provider.generate(prompt, reference_b64)
                        return img, provider.name
                    except ImageGenError as e2:
                        logger.warning("Gemini retry failed: %s", e2)
                        last_err = e2
        raise ImageGenError(f"All image providers failed. Last error: {last_err}")
