import { useSyncExternalStore } from 'react';
import { PROFILES } from './config.js';
import { DEMO_FOODS } from './foods.js';
import { LS } from './utils.js';

/*
  חנות הנתונים המקומית. כל פריט (ארוחה, מאכל, יום, משקל, היקף) הוא מסמך:
  { id: 'kind:user:key', kind, user, ts, del, d }
  ts משמש להכרעת "הכתיבה האחרונה מנצחת" בין מכשירים. מחיקה היא מסמך del עם ts.
  dirty הוא תור היציאה: מסמכים שעוד לא עלו לענן (נשמר מקומית ושורד סגירה של הדף).
*/
let docs = LS.get('nt2:docs', {});
let dirty = LS.get('nt2:dirty', {});
let version = 0;
let saveTimer = null;
const subs = new Set();

const idOf = (kind, user, key) => kind + ':' + user + ':' + key;
const stamp = (old) => Math.max(Date.now(), old ? old.ts + 1 : 0);

function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  LS.set('nt2:docs', docs);
  LS.set('nt2:dirty', dirty);
}
function emit() {
  version++;
  if (!saveTimer) saveTimer = setTimeout(flush, 250);
  subs.forEach((f) => f());
}
function write(kind, user, key, d) {
  const id = idOf(kind, user, key);
  docs[id] = { id, kind, user, ts: stamp(docs[id]), del: d == null, d: d == null ? {} : d };
  dirty[id] = true;
}

window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
});

export const Store = {
  subscribe(f) {
    subs.add(f);
    return () => subs.delete(f);
  },
  version: () => version,
  get(kind, user, key) {
    const x = docs[idOf(kind, user, key)];
    return x && !x.del ? x.d : null;
  },
  list(kind, user) {
    const prefix = kind + ':' + user + ':';
    const out = [];
    for (const id in docs) if (id.startsWith(prefix) && !docs[id].del) out.push(docs[id].d);
    return out;
  },
  /* כמה כתיבות יחד. מחזיר תמונת מצב קודם לביטול. d == null מוחק */
  tx(ops) {
    const snap = ops.map((o) => ({ kind: o.kind, user: o.user, key: o.key, prev: Store.get(o.kind, o.user, o.key) }));
    ops.forEach((o) => write(o.kind, o.user, o.key, o.d));
    emit();
    return snap;
  },
  undo(snap) {
    Store.tx(snap.slice().reverse().map((s) => ({ kind: s.kind, user: s.user, key: s.key, d: s.prev })));
  },
  put(kind, user, key, d) {
    Store.tx([{ kind, user, key, d }]);
  },
  remove(kind, user, key) {
    if (Store.get(kind, user, key)) Store.tx([{ kind, user, key, d: null }]);
  },
  /* זריעה: ts=1 ולא נשלח לענן, כך שכל עריכה אמיתית (מכל מכשיר) גוברת עליה */
  seed(kind, user, key, d) {
    const id = idOf(kind, user, key);
    if (!docs[id]) docs[id] = { id, kind, user, ts: 1, del: false, d };
  },

  /* ---- סנכרון ---- */
  dirtyDocs: () => Object.keys(dirty).filter((id) => docs[id]).map((id) => docs[id]),
  hasDirty: () => Object.keys(dirty).length > 0,
  clearDirty(pushed) {
    pushed.forEach((p) => {
      if (docs[p.id] && docs[p.id].ts === p.ts) delete dirty[p.id];
    });
    flush();
  },
  markAllDirty() {
    for (const id in docs) if (docs[id].ts > 1) dirty[id] = true;
    flush();
  },
  merge(rows) {
    let changed = false;
    for (const r of rows) {
      const local = docs[r.id];
      if (!local || r.ts > local.ts) {
        docs[r.id] = { id: r.id, kind: r.kind, user: r.usr, ts: r.ts, del: !!r.del, d: r.d || {} };
        delete dirty[r.id];
        changed = true;
      } else if (r.ts === local.ts) delete dirty[r.id];
    }
    if (changed) emit();
    else flush();
    return changed;
  },

  /* ---- גיבוי ---- */
  exportAll: () => ({ app: 'nutri', v: 2, at: new Date().toISOString(), docs: Object.values(docs) }),
  importAll(obj) {
    if (!obj || !Array.isArray(obj.docs)) throw new Error('קובץ גיבוי לא תקין');
    let n = 0;
    for (const x of obj.docs) {
      if (!x || !x.id || !x.kind || !x.user || typeof x.ts !== 'number') continue;
      const local = docs[x.id];
      if (!local || x.ts > local.ts) {
        docs[x.id] = { id: x.id, kind: x.kind, user: x.user, ts: x.ts, del: !!x.del, d: x.d || {} };
        dirty[x.id] = true;
        n++;
      }
    }
    emit();
    return n;
  },
  flush,
};

export const useStoreVersion = () => useSyncExternalStore(Store.subscribe, Store.version);

/* מאגר ברירת המחדל נזרע פעם אחת לכל משתמש */
export function seedFoods() {
  const seeded = LS.get('nt2:seeded', {});
  for (const user of Object.keys(PROFILES)) {
    if (seeded[user]) continue;
    DEMO_FOODS.forEach((f) => Store.seed('food', user, f.id, f));
    seeded[user] = true;
  }
  LS.set('nt2:seeded', seeded);
  Store.flush();
}
