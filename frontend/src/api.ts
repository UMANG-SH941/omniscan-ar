const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export type Scan = {
  id: string;
  name: string;
  category: string;
  confidence: string;
  short_label: string;
  description: string;
  usage: string;
  insights: string[];
  tags: string[];
  image_base64: string;
  favorite: boolean;
  chat_history: { role: string; text: string; timestamp: string }[];
  created_at: string;
};

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export async function scanImage(imageBase64: string): Promise<Scan> {
  const res = await fetch(`${BASE}/api/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_base64: imageBase64 }),
  });
  return handle<Scan>(res);
}

export async function listScans(category?: string, favoritesOnly?: boolean): Promise<Scan[]> {
  const params = new URLSearchParams();
  if (category && category !== 'all') params.set('category', category);
  if (favoritesOnly) params.set('favorites_only', 'true');
  const res = await fetch(`${BASE}/api/scans?${params.toString()}`);
  return handle<Scan[]>(res);
}

export async function getScan(id: string): Promise<Scan> {
  const res = await fetch(`${BASE}/api/scans/${id}`);
  return handle<Scan>(res);
}

export async function toggleFavorite(id: string): Promise<Scan> {
  const res = await fetch(`${BASE}/api/scans/${id}/favorite`, { method: 'POST' });
  return handle<Scan>(res);
}

export async function deleteScan(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/scans/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Delete failed ${res.status}`);
}

export async function chatAboutScan(id: string, message: string): Promise<Scan> {
  const res = await fetch(`${BASE}/api/scans/${id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return handle<Scan>(res);
}
