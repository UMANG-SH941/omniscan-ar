/**
 * Runtime app configuration.
 *
 * The backend URL defaults to the value baked in at build time
 * (EXPO_PUBLIC_BACKEND_URL) but can be changed by the user from the scanner's
 * settings sheet — essential for distributed APKs, where the build-time URL
 * rarely matches the network the app ends up on.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'omniscan.backend_url';
const DEFAULT_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

/** Trim, drop trailing slashes, and default to http:// when no scheme given —
 * browsers forgive a missing scheme but fetch() does not. */
export function normalizeUrl(url: string): string {
  let clean = url.trim().replace(/\/+$/, '');
  if (clean && !/^https?:\/\//i.test(clean)) {
    clean = `http://${clean}`;
  }
  return clean;
}

let cached: string | null = null;

export async function getBackendUrl(): Promise<string> {
  if (cached !== null) return cached;
  try {
    const stored = await AsyncStorage.getItem(KEY);
    cached = normalizeUrl(stored || DEFAULT_URL);
  } catch {
    cached = normalizeUrl(DEFAULT_URL);
  }
  return cached;
}

export async function setBackendUrl(url: string): Promise<void> {
  const clean = normalizeUrl(url);
  cached = clean || normalizeUrl(DEFAULT_URL);
  try {
    if (clean) {
      await AsyncStorage.setItem(KEY, clean);
    } else {
      await AsyncStorage.removeItem(KEY); // revert to build-time default
    }
  } catch {
    /* persisting failed; in-memory value still applies this session */
  }
}

export function defaultBackendUrl(): string {
  return DEFAULT_URL;
}

export type PingResult = {
  ok: boolean;
  detail: string; // human-readable outcome, incl. the underlying error
  ms: number;
};

/** Reachability probe used by the settings sheet. Reports the real error so
 * connection problems (blocked cleartext, timeout, DNS, wrong port) are
 * distinguishable on-device. */
export async function pingBackend(url: string): Promise<PingResult> {
  const started = Date.now();
  const target = normalizeUrl(url);
  if (!target) return { ok: false, detail: 'no URL entered', ms: 0 };
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${target}/api/health`, { signal: controller.signal });
    clearTimeout(t);
    const ms = Date.now() - started;
    if (res.ok) return { ok: true, detail: `online in ${ms}ms`, ms };
    return { ok: false, detail: `server answered HTTP ${res.status}`, ms };
  } catch (e: any) {
    const ms = Date.now() - started;
    const msg = e?.name === 'AbortError' ? 'timed out after 6s' : String(e?.message || e);
    return { ok: false, detail: msg, ms };
  }
}
