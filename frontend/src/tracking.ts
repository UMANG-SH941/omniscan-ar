/**
 * TrackingService — client-side object tracking for the live AR HUD.
 *
 * The backend detector returns fresh boxes each frame; this module matches
 * them to existing tracks by IoU so labels keep persistent IDs, and applies
 * exponential smoothing so overlays glide instead of flickering.
 */
import { DetectedObject } from './api';

export type Track = {
  id: number;
  label: string;
  confidence: number;
  // normalized, smoothed box
  x: number;
  y: number;
  w: number;
  h: number;
  age: number; // detection cycles this track has survived
  missed: number; // consecutive cycles without a match
};

const IOU_MATCH_THRESHOLD = 0.25;
const SMOOTHING = 0.45; // how strongly a new detection pulls the box
const MAX_MISSED = 1; // drop a track after this many missed cycles

let nextTrackId = 1;

function iou(a: Track, b: DetectedObject): number {
  const [bx, by, bw, bh] = b.box;
  const x1 = Math.max(a.x, bx);
  const y1 = Math.max(a.y, by);
  const x2 = Math.min(a.x + a.w, bx + bw);
  const y2 = Math.min(a.y + a.h, by + bh);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + bw * bh - inter;
  return union > 0 ? inter / union : 0;
}

export function updateTracks(prev: Track[], detections: DetectedObject[]): Track[] {
  const unmatched = new Set(detections.map((_, i) => i));
  const next: Track[] = [];

  // Greedy matching: best IoU pair first.
  const pairs: { t: number; d: number; score: number }[] = [];
  prev.forEach((t, ti) =>
    detections.forEach((d, di) => {
      const score = iou(t, d);
      if (score >= IOU_MATCH_THRESHOLD) pairs.push({ t: ti, d: di, score });
    })
  );
  pairs.sort((a, b) => b.score - a.score);

  const usedTracks = new Set<number>();
  for (const { t, d } of pairs) {
    if (usedTracks.has(t) || !unmatched.has(d)) continue;
    usedTracks.add(t);
    unmatched.delete(d);
    const track = prev[t];
    const [dx, dy, dw, dh] = detections[d].box;
    next.push({
      ...track,
      label: detections[d].label,
      confidence: detections[d].confidence,
      x: track.x + (dx - track.x) * SMOOTHING,
      y: track.y + (dy - track.y) * SMOOTHING,
      w: track.w + (dw - track.w) * SMOOTHING,
      h: track.h + (dh - track.h) * SMOOTHING,
      age: track.age + 1,
      missed: 0,
    });
  }

  // Unmatched existing tracks: keep briefly (coast) so boxes don't blink out.
  prev.forEach((t, ti) => {
    if (!usedTracks.has(ti) && t.missed < MAX_MISSED) {
      next.push({ ...t, missed: t.missed + 1 });
    }
  });

  // Brand-new detections become new tracks.
  unmatched.forEach((di) => {
    const d = detections[di];
    const [x, y, w, h] = d.box;
    next.push({
      id: nextTrackId++,
      label: d.label,
      confidence: d.confidence,
      x, y, w, h,
      age: 1,
      missed: 0,
    });
  });

  return next;
}

/**
 * Map a normalized box to screen pixels, assuming the camera preview fills
 * the screen with "cover" fit (the captured frame is center-cropped).
 */
export function mapBoxToScreen(
  t: Track,
  imgW: number,
  imgH: number,
  screenW: number,
  screenH: number
): { x: number; y: number; w: number; h: number } {
  const scale = Math.max(screenW / imgW, screenH / imgH);
  const dispW = imgW * scale;
  const dispH = imgH * scale;
  const offX = (dispW - screenW) / 2;
  const offY = (dispH - screenH) / 2;
  return {
    x: t.x * dispW - offX,
    y: t.y * dispH - offY,
    w: t.w * dispW,
    h: t.h * dispH,
  };
}
