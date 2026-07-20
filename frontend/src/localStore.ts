/**
 * Offline-first scan vault.
 *
 * Every scan (including its photo and generated future images) is mirrored to
 * a JSON file in the app's private storage, so history, results and lifecycle
 * simulations stay fully viewable when the EvoSnap server is off.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { Scan } from './api';

const DIR = `${FileSystem.documentDirectory || ''}scans/`;
const isNative = Platform.OS !== 'web' && !!FileSystem.documentDirectory;

async function ensureDir(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
  } catch {
    /* storage unavailable */
  }
}

export async function saveScanLocally(scan: Scan): Promise<void> {
  if (!isNative) return;
  try {
    await ensureDir();
    await FileSystem.writeAsStringAsync(`${DIR}${scan.id}.json`, JSON.stringify(scan));
  } catch (e) {
    console.log('local save failed', e);
  }
}

export async function getLocalScan(id: string): Promise<Scan | null> {
  if (!isNative) return null;
  try {
    const raw = await FileSystem.readAsStringAsync(`${DIR}${id}.json`);
    return JSON.parse(raw) as Scan;
  } catch {
    return null;
  }
}

export async function listLocalScans(): Promise<Scan[]> {
  if (!isNative) return [];
  try {
    await ensureDir();
    const files = await FileSystem.readDirectoryAsync(DIR);
    const scans: Scan[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = await FileSystem.readAsStringAsync(`${DIR}${f}`);
        scans.push(JSON.parse(raw) as Scan);
      } catch {
        /* skip corrupt file */
      }
    }
    scans.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return scans;
  } catch {
    return [];
  }
}

export async function deleteLocalScan(id: string): Promise<void> {
  if (!isNative) return;
  try {
    await FileSystem.deleteAsync(`${DIR}${id}.json`, { idempotent: true });
  } catch {
    /* ignore */
  }
}

/** Merge a partial update (e.g. a new future image) into the stored copy. */
export async function updateLocalScan(id: string, patch: Partial<Scan>): Promise<void> {
  const existing = await getLocalScan(id);
  if (!existing) return;
  await saveScanLocally({ ...existing, ...patch });
}
