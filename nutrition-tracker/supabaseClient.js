import { useSyncExternalStore } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Store } from './store.js';
import { Media } from './exerciseMedia.js';
import { LS } from './utils.js';

/*
  סנכרון ענן. הנתונים תמיד נשמרים מקומית (localStorage) והענן הוא סנכרון והעתק.
  בצד Supabase יש טבלה אחת סגורה ל-anon ושתי פונקציות RPC (supabase/setup.sql)
  שמקבלות את "מפתח הסנכרון" כפרמטר.
  כתובת ומפתח ציבורי: מההגדרות במסך, ואם חסרים, ממשתני הסביבה VITE_SUPABASE_URL / VITE_SUPABASE_KEY.
*/
const ENV = { url: import.meta.env.VITE_SUPABASE_URL || '', key: import.meta.env.VITE_SUPABASE_KEY || '' };

export const genSyncKey = () => {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(28)), (b) => abc[b % abc.length]).join('');
};

let cfg = { url: '', key: '', sync: '', ...LS.get('nt2:cloud', {}) };
let status = { state: 'off', msg: '', at: 0 };
let version = 0;
let client = null;
let clientSig = '';
let running = false;
let again = false;
let timer = null;
const subs = new Set();

const effective = () => ({ url: (cfg.url || ENV.url).trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, ''), key: (cfg.key || ENV.key).trim() });
const enabled = () => {
  const e = effective();
  return !!(e.url && e.key && cfg.sync && cfg.sync.length >= 16);
};
const setStatus = (p) => {
  status = { ...status, ...p };
  version++;
  subs.forEach((f) => f());
};
const cursorKey = () => 'nt2:cursor:' + cfg.sync;

function getClient() {
  const e = effective();
  const sig = e.url + '|' + e.key;
  if (!client || sig !== clientSig) {
    client = createClient(e.url, e.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    clientSig = sig;
  }
  return client;
}

async function rpc(fn, args) {
  const ctl = new AbortController();
  const timeout = setTimeout(() => ctl.abort(), 20000);
  try {
    const { data, error, status } = await getClient().rpc(fn, args).abortSignal(ctl.signal);
    if (error) {
      let msg = error.message || String(error);
      if (error.code === 'PGRST202' || status === 404) msg = 'הפונקציות לא נמצאו. יש להריץ את סקריפט ה-SQL (supabase/setup.sql). ' + msg;
      throw new Error((status ? 'HTTP ' + status + ': ' : '') + msg);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

/* תמונות התרגילים מ-exercise_db. כישלון כאן (למשל הפונקציה עוד לא הותקנה) לא פוגע בסנכרון */
async function pullMedia() {
  if (!enabled()) return;
  try {
    Media.set(await rpc('nt_exercise_media', { p_key: cfg.sync }));
  } catch {
    /* נשארים עם מה שנשמר מקומית */
  }
}

async function sync() {
  if (!enabled()) { setStatus({ state: 'off', msg: '' }); return; }
  if (running) { again = true; return; }
  running = true;
  setStatus({ state: 'syncing', msg: '' });
  try {
    // 1. דחיפה
    const up = Store.dirtyDocs();
    for (let i = 0; i < up.length; i += 100) {
      const chunk = up.slice(i, i + 100);
      await rpc('nt_push', {
        p_key: cfg.sync,
        p_rows: chunk.map((x) => ({ id: x.id, kind: x.kind, usr: x.user, ts: x.ts, del: x.del, d: x.d })),
      });
      Store.clearDirty(chunk);
    }
    // 2. משיכה
    let since = LS.get(cursorKey(), 0);
    for (;;) {
      const rows = await rpc('nt_pull', { p_key: cfg.sync, p_since: since, p_limit: 500 });
      if (!rows || !rows.length) break;
      Store.merge(rows);
      since = rows.reduce((m, r) => Math.max(m, r.srv), since);
      LS.set(cursorKey(), since);
      if (rows.length < 500) break;
    }
    await pullMedia();
    setStatus({ state: 'ok', msg: '', at: Date.now() });
  } catch (e) {
    setStatus({ state: navigator.onLine === false ? 'offline' : 'error', msg: String((e && e.message) || e).slice(0, 220) });
  } finally {
    running = false;
    if (again) { again = false; schedule(300); }
  }
}

function schedule(ms) {
  clearTimeout(timer);
  timer = setTimeout(sync, ms);
}

export const Cloud = {
  subscribe(f) { subs.add(f); return () => subs.delete(f); },
  version: () => version,
  status: () => status,
  config: () => ({ url: cfg.url || '', key: cfg.key || '', sync: cfg.sync || '' }),
  envDefaults: () => ENV,
  enabled,
  sync,
  refreshMedia: pullMedia,
  /* שמירת חיבור חדש: מעלה את כל המידע המקומי ומושך את מה שכבר בענן */
  configure(next) {
    const before = effective().url + effective().key + cfg.sync;
    cfg = { url: next.url.trim(), key: next.key.trim(), sync: next.sync.trim() };
    LS.set('nt2:cloud', cfg);
    if (enabled() && effective().url + effective().key + cfg.sync !== before) Store.markAllDirty();
    return sync();
  },
  disconnect() {
    cfg = { url: '', key: '', sync: '' };
    LS.set('nt2:cloud', cfg);
    setStatus({ state: 'off', msg: '' });
  },
  start() {
    Store.subscribe(() => { if (enabled() && Store.hasDirty()) schedule(1200); });
    window.addEventListener('online', () => schedule(200));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(200); });
    setInterval(() => { if (document.visibilityState === 'visible') sync(); }, 45000);
    if (enabled()) schedule(100);
    else setStatus({ state: 'off' });
  },
};

export const useCloud = () => {
  useSyncExternalStore(Cloud.subscribe, Cloud.version);
  return Cloud.status();
};
