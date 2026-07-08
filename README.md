# OmniScan AR — AI Spatial Intelligence Platform

An AI-powered AR scanner that detects objects in real time, understands them with
vision-language models, reasons about their environmental impact, and simulates
how they will degrade over the next 10–500 years — all overlaid on the camera
view as a holographic HUD.

## Features

- **Live AR mode** — the camera streams frames to the detector; tracked objects get
  persistent IDs, smoothed (non-flickering) holographic bounding boxes, connector
  lines and confidence bars.
- **Deep scan** — one tap runs the full pipeline: identification, material analysis,
  lifecycle, recycling category, carbon footprint, sustainability & recycling
  scores, decomposition timeline and interesting facts.
- **Visualization modes** — Normal / Study / Eco / Shop / Nature / History / Future
  lenses change what the knowledge engine emphasizes.
- **Future Vision** — AI-generated simulations of the scanned object after
  10 / 25 / 50 / 100 / 250 / 500 years outdoors, preserving geometry and
  perspective (image-to-image when the provider supports it). Generated once,
  cached per stage.
- **Grounded Q&A** — chat about any scan; the assistant keeps conversation history
  and stays anchored to the scanned object.
- **History & favorites** with category filters.

## Architecture

```
frontend/  Expo (React Native) — expo-router, reanimated, expo-camera
  app/(tabs)/index.tsx   Scanner + live AR HUD + mode selector
  app/scan/[id].tsx      Result: overview / impact infographics / future vision / chat
  src/api.ts             Typed API client
  src/tracking.ts        Client-side tracking (IoU matching + smoothing)

backend/   FastAPI — thin routes, modular AI services (each independently replaceable)
  server.py                        API layer only
  models.py                        Pydantic schemas
  services/llm.py                  LLM gateway: Gemini REST (free) ⇄ Ollama (open source)
  services/detection.py            DetectionService (multi-object boxes)
  services/vision_language.py      VisionLanguageService (identity + materials)
  services/knowledge.py            KnowledgeService (impact reasoning + Q&A)
  services/prompt_generation.py    PromptGenerationService (future-sim prompts)
  services/image_generation.py     ImageGenerationService (Stable Diffusion / Gemini / OpenAI)
  services/storage.py              MongoDB, with JSON-file fallback
```

Pipeline per frame (live): `camera → /api/detect → client tracking → AR overlay`.
Pipeline per deep scan: `photo → VisionLanguage → Knowledge → holographic infographics`,
then on demand `PromptGeneration → ImageGeneration → Future Vision timeline`.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Provider/storage status |
| `POST /api/detect` | Real-time multi-object detection (normalized boxes) |
| `POST /api/scan` | Full analysis pipeline (`{image_base64, mode}`) |
| `GET /api/scans` · `GET/DELETE /api/scans/{id}` | History |
| `POST /api/scans/{id}/favorite` | Toggle favorite |
| `POST /api/scans/{id}/chat` | Grounded Q&A |
| `POST /api/scans/{id}/future` | Generate future simulation (`{years}`) |

## Running

Everything is free — pick your AI backend:

- **Free hosted (default):** Google Gemini free tier — one API key, no infra.
- **Fully open source / offline:** [Ollama](https://ollama.com) for the LLM +
  [Stable Diffusion WebUI](https://github.com/AUTOMATIC1111/stable-diffusion-webui)
  for image generation. No API keys, everything runs on your machine.

```bash
# backend
cd backend
pip install -r requirements.txt
# option A (free hosted): put GEMINI_API_KEY=... in .env  (https://aistudio.google.com/apikey)
# option B (open source): ollama pull qwen2.5vl:7b, then set LLM_PROVIDER=ollama in .env
python -m uvicorn server:app --port 8001

# frontend
cd frontend
# point the app at your machine's LAN IP for phone use:
#   EXPO_PUBLIC_BACKEND_URL=http://192.168.x.x:8001  in frontend/.env
yarn && yarn start                     # scan QR with Expo Go
```

Environment variables (backend/.env):

| Var | Role |
|---|---|
| `GEMINI_API_KEY` | Gemini REST (LLM + image gen), free tier |
| `LLM_PROVIDER` | Set to `ollama` for fully local open-source inference |
| `OLLAMA_URL` / `OLLAMA_MODEL` | Ollama endpoint + vision model (default `http://127.0.0.1:11434`, `qwen2.5vl:7b`) |
| `SD_WEBUI_URL` | AUTOMATIC1111 WebUI (`--api`) for open-source image generation |
| `OPENAI_API_KEY` | Optional paid image-gen fallback (gpt-image-1) |
| `GEMINI_MODEL` / `GEMINI_IMAGE_MODEL` | Model overrides (default `gemini-2.5-flash` / `gemini-2.5-flash-image`) |
| `MONGO_URL` / `DB_NAME` | MongoDB; JSON file store used if unreachable |

## Roadmap

- On-device detection (TFLite/YOLO via a dev build) for true 30–60 FPS boxes
- SAM2 instance segmentation masks for occlusion-aware overlays
- Alpha-matted future images composited directly onto the tracked object
- Future World mode (whole-scene environmental simulation)
- Auth + user accounts, CI, analytics
