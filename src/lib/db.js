// Firestore-backed persistence — ported from index.html lines ~501-691.
// The whole app works against a single in-memory `DB` object (DB.students, DB.mockTests, etc.)
// — load/save talk to Cloud Firestore. Every top-level key lives at `tce_app_data/{key}`.
// Small values are written straight onto that document; anything too big for one document is
// auto-split across numbered chunk docs in a `tce_app_data/{key}/chunks` subcollection and
// transparently reassembled on read, so bulk uploads can never hit Firestore's 1MB/doc limit.
import {
  collection, doc, getDoc, setDoc, writeBatch, onSnapshot,
} from 'firebase/firestore';
import { fbDB, DEMO_MODE } from '../firebase';
import { seedDB, normalizeDB } from './seedData';

export const FS_COLLECTION = 'tce_app_data';
export const DB_KEYS = [
  'examCategories', 'banners', 'ticker', 'students', 'mockTests', 'quizPool', 'pyqSets',
  'submissions', 'materials', 'notices', 'inquiries', 'batches', 'mentors', 'quizDurations',
  'urgentNotices',
];
const FS_MAX_DOC_BYTES = 900000; // safety margin under Firestore's 1,048,576 byte/doc limit

// Cloud Firestore rejects arrays that directly contain other arrays ("nested arrays are not
// supported") — e.g. a batch's timetable stored as [["Mon","Math"],["Tue","GK"]]. Walk the
// data and transparently wrap any such inner array as a plain object ({0:"Mon",1:"Math"}).
function firestoreSafeArrays(value) {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (Array.isArray(item)) {
        const obj = {};
        item.forEach((v, i) => { obj[i] = firestoreSafeArrays(v); });
        return obj;
      }
      return firestoreSafeArrays(item);
    });
  }
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach((k) => { out[k] = firestoreSafeArrays(value[k]); });
    return out;
  }
  return value;
}
function sanitizeForFirestore(value) { return firestoreSafeArrays(JSON.parse(JSON.stringify(value))); }
function utf8ByteLength(str) { return new TextEncoder().encode(str).length; }

function splitStringByBytes(str, maxBytes) {
  const chunks = [];
  let start = 0;
  const len = str.length;
  while (start < len) {
    let lo = start + 1, hi = len, best = start + 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (utf8ByteLength(str.slice(start, mid)) <= maxBytes) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    chunks.push(str.slice(start, best));
    start = best;
  }
  return chunks;
}

export async function writeKeyValue(key, value) {
  const ref = doc(fbDB, FS_COLLECTION, key);
  const chunksRef = collection(ref, 'chunks');
  const clean = sanitizeForFirestore(value);
  const json = JSON.stringify(clean);
  const rev = Date.now();

  let previousChunkCount = 0;
  try {
    const prevSnap = await getDoc(ref);
    if (prevSnap.exists()) previousChunkCount = prevSnap.data().chunkCount || 0;
  } catch (e) { /* ignore */ }

  if (utf8ByteLength(json) <= FS_MAX_DOC_BYTES) {
    await setDoc(ref, { chunked: false, value: clean, chunkCount: 0, rev });
    if (previousChunkCount > 0) {
      const cleanupBatch = writeBatch(fbDB);
      for (let i = 0; i < previousChunkCount; i++) cleanupBatch.delete(doc(chunksRef, 'c' + i));
      await cleanupBatch.commit().catch(() => {});
    }
    return;
  }

  const parts = splitStringByBytes(json, FS_MAX_DOC_BYTES);
  const batch = writeBatch(fbDB);
  batch.set(ref, { chunked: true, value: null, chunkCount: parts.length, rev });
  parts.forEach((part, i) => batch.set(doc(chunksRef, 'c' + i), { data: part }));
  for (let i = parts.length; i < previousChunkCount; i++) batch.delete(doc(chunksRef, 'c' + i));
  await batch.commit();
}

export async function readKeyValue(key, fallback) {
  const ref = doc(fbDB, FS_COLLECTION, key);
  const snap = await getDoc(ref);
  if (!snap.exists()) return fallback;
  const d = snap.data();
  if (!d.chunked) return ('value' in d) ? d.value : fallback;
  const count = d.chunkCount || 0;
  if (count === 0) return fallback;
  const chunksRef = collection(ref, 'chunks');
  const chunkSnaps = await Promise.all(Array.from({ length: count }, (_, i) => getDoc(doc(chunksRef, 'c' + i))));
  const json = chunkSnaps.map((s) => (s.exists() ? (s.data().data || '') : '')).join('');
  try { return JSON.parse(json); } catch (e) { console.error('Failed to reassemble chunked data for ' + key, e); return fallback; }
}

export async function seedFirestoreFromScratch() {
  const seeded = seedDB();
  await Promise.all(DB_KEYS.map((key) => writeKeyValue(key, seeded[key])));
  return seeded;
}

export async function loadDB() {
  if (DEMO_MODE || !fbDB) {
    console.warn('Firestore is not available — running on local in-memory demo data only (nothing will be saved).');
    return normalizeDB(seedDB());
  }
  try {
    const coreRef = doc(fbDB, FS_COLLECTION, 'mockTests');
    const coreDoc = await getDoc(coreRef);
    if (!coreDoc.exists()) {
      const seeded = await seedFirestoreFromScratch();
      return normalizeDB(seeded);
    }
    const seeded = seedDB(); // used only to backfill any keys/docs that don't exist yet
    const assembled = {};
    await Promise.all(DB_KEYS.map(async (key) => { assembled[key] = await readKeyValue(key, seeded[key]); }));
    return normalizeDB(assembled);
  } catch (e) {
    console.error('Could not load data from Firestore, falling back to local demo data.', e);
    return normalizeDB(seedDB());
  }
}

export async function saveDB(DB) {
  if (DEMO_MODE || !fbDB) return;
  try {
    await Promise.all(DB_KEYS.map((key) => writeKeyValue(key, DB[key])));
  } catch (err) {
    console.error('Firestore save failed:', err);
    alert('⚠ Could not sync your latest change to the cloud database. Please check your internet connection and try again.');
  }
}

// Live sync: fires `onChange(key, incomingValue)` whenever another admin/device changes a key.
// Returns an unsubscribe function — call it in a useEffect cleanup.
export function attachDbRealtimeListeners(DB, onChange) {
  if (DEMO_MODE || !fbDB) return () => {};
  const unsubs = DB_KEYS.map((key) => onSnapshot(doc(fbDB, FS_COLLECTION, key), async (snap) => {
    if (!snap.exists()) return;
    try {
      const incoming = await readKeyValue(key, DB[key]);
      const changed = JSON.stringify(DB[key]) !== JSON.stringify(incoming);
      if (changed) onChange(key, incoming);
    } catch (e) { console.warn('Live sync reassembly failed for ' + key, e); }
  }, (err) => console.warn('Live sync listener error for ' + key + ':', err)));
  return () => unsubs.forEach((u) => u());
}

export const BANNERS_DOC_ID = 'heroBanners';
export function defaultBannersFromDB(DB) {
  return (DB.banners || []).map((b) => ({
    id: b.id || Math.random().toString(36).slice(2), title: b.title, subtitle: b.subtitle,
    image: '', link: '', grad: b.grad || 'from-amber-600 via-yellow-500 to-orange-600', tag: b.tag || '',
  }));
}
export async function loadBanners(DB) {
  if (DEMO_MODE || !fbDB) return defaultBannersFromDB(DB);
  try {
    const value = await readKeyValue(BANNERS_DOC_ID, null);
    if (Array.isArray(value) && value.length) return value;
    const seeded = defaultBannersFromDB(DB);
    await writeKeyValue(BANNERS_DOC_ID, seeded);
    return seeded;
  } catch (e) {
    console.error('Could not load banners from Firestore, using local defaults.', e);
    return defaultBannersFromDB(DB);
  }
}
export async function saveBanners(banners) {
  if (DEMO_MODE || !fbDB) return;
  try { await writeKeyValue(BANNERS_DOC_ID, banners); } catch (err) {
    console.error('Firestore banner save failed:', err);
    alert('⚠ Could not sync this banner to the cloud database. Please check your internet connection and try again.');
  }
}
