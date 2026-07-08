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

let cached: string | null = null;

export async function getBackendUrl(): Promise<string> {
  if (cached !== null) return cached;
  try {
    const stored = await AsyncStorage.getItem(KEY);
    cached = (stored || DEFAULT_URL).replace(/\/+$/, '');
  } catch {
    cached = DEFAULT_URL;
  }
  return cached;
}

export async function setBackendUrl(url: string): Promise<void> {
  const clean = url.trim().replace(/\/+$/, '');
  cached = clean || DEFAULT_URL;
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

/** Quick reachability probe used by the settings sheet. */
export async function pingBackend(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${url.replace(/\/+$/, '')}/api/health`, {
      signal: controller.signal,
    });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}
