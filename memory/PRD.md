# OmniScan AR - Product Requirements Document

## Overview
AR-based object scanning and identification mobile app built on React Native Expo. Uses device camera + Gemini 3 Flash vision to identify real-world objects and overlay AR-style information cards.

## Core Features
1. **Live camera scanner** with AR HUD overlay (glowing reticle, corner brackets, crosshair, animated scan line during processing)
2. **AI object identification** — tap-to-scan captures an image and returns structured data: name, category, confidence, short AR label, description, usage, 3 insights, tags
3. **Multi-turn chat** — follow-up questions about any scanned object, with context of the original scan
4. **Scan history** — auto-saved to MongoDB, bento-grid cards with thumbnails
5. **Category filtering** — all / plant / product / landmark / object / animal / food / other
6. **Favorites** — star scans and filter a dedicated favorites view
7. **Scan detail** — hero image with AR corner brackets, floating label tag, tabs (OVERVIEW | ASK AI), delete action
8. **Web fallback** — when running on web, scan opens an image upload dialog so the flow remains testable without a native camera

## Tech Stack
- Frontend: Expo Router 6, React Native 0.81, expo-camera, expo-image-manipulator, expo-haptics, react-native-reanimated
- Backend: FastAPI + Motor (MongoDB)
- AI: Gemini 3 Flash Preview via `emergentintegrations` + Emergent Universal LLM Key
- Fonts: Ionicons preloaded via `useFonts`

## Backend API
- `GET /api/` — health
- `POST /api/scan` — body `{image_base64}` → Scan
- `GET /api/scans?category=&favorites_only=` — list
- `GET /api/scans/{id}` — detail
- `POST /api/scans/{id}/favorite` — toggle
- `DELETE /api/scans/{id}` — delete
- `POST /api/scans/{id}/chat` — body `{message}` → Scan with appended chat history

## Authentication
None. Single-user experience.

## Design Language
Archetype 7 Tactical HUD: pure black base (#050505), neon green accent (#00FF66), cyan for AR labels (#00E5FF), mono font (Courier/monospace) for all data/labels, crystal glass panels with backdrop blur, AR corner brackets and reticle.
