import { getBackendUrl } from './config';

export type ChatTurn = { role: string; text: string; timestamp: string };

export type DecompositionStage = { years: string; state: string };

export type Scan = {
  id: string;
  name: string;
  category: string;
  confidence: string;
  short_label: string;
  description: string;
  usage: string;
  material: string;
  materials: string[];
  physical_properties: string;
  lifecycle: string;
  recycling_category: string;
  tags: string[];
  explanation: string;
  insights: string[];
  sustainability_advice: string;
  carbon_footprint: string;
  sustainability_score: number; // 0-100, -1 = unknown
  recycling_score: number; // 0-100, -1 = unknown
  decomposition_years: string;
  decomposition_timeline: DecompositionStage[];
  environmental_impact: string;
  mode: string;
  mode_focus: string;
  ml_material: string;
  ml_confidence: number; // 0-1 from our trained classifier, -1 = unavailable
  image_base64: string;
  future_images: Record<string, string>;
  favorite: boolean;
  chat_history: ChatTurn[];
  created_at: string;
};

export type DetectedObject = {
  label: string;
  confidence: number;
  // normalized [x, y, w, h] in 0..1 relative to the submitted frame
  box: [number, number, number, number];
};

export type FutureResult = {
  years: number;
  image_base64: string;
  prompt: string;
  provider: string;
  cached: boolean;
};

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.detail ? String(body.detail) : JSON.stringify(body);
    } catch {
      detail = await res.text().catch(() => '');
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json();
}

async function post(path: string, body?: unknown): Promise<Response> {
  const base = await getBackendUrl();
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function detectObjects(
  imageBase64: string,
  signal?: AbortSignal
): Promise<{ objects: DetectedObject[]; count: number }> {
  const base = await getBackendUrl();
  const res = await fetch(`${base}/api/detect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_base64: imageBase64 }),
    signal,
  });
  return handle(res);
}

export async function scanImage(imageBase64: string, mode = 'normal'): Promise<Scan> {
  return handle<Scan>(await post('/api/scan', { image_base64: imageBase64, mode }));
}

export async function listScans(category?: string, favoritesOnly?: boolean): Promise<Scan[]> {
  const params = new URLSearchParams();
  if (category && category !== 'all') params.set('category', category);
  if (favoritesOnly) params.set('favorites_only', 'true');
  const base = await getBackendUrl();
  const res = await fetch(`${base}/api/scans?${params.toString()}`);
  return handle<Scan[]>(res);
}

export async function getScan(id: string): Promise<Scan> {
  const base = await getBackendUrl();
  return handle<Scan>(await fetch(`${base}/api/scans/${id}`));
}

export async function toggleFavorite(id: string): Promise<Scan> {
  return handle<Scan>(await post(`/api/scans/${id}/favorite`));
}

export async function deleteScan(id: string): Promise<void> {
  const base = await getBackendUrl();
  const res = await fetch(`${base}/api/scans/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Delete failed ${res.status}`);
}

export async function chatAboutScan(id: string, message: string): Promise<Scan> {
  return handle<Scan>(await post(`/api/scans/${id}/chat`, { message }));
}

export async function generateFuture(id: string, years: number): Promise<FutureResult> {
  return handle<FutureResult>(await post(`/api/scans/${id}/future`, { years }));
}
