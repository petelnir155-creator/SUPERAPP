import { useSyncExternalStore } from 'react';
import { LS } from './utils.js';

/*
  תמונות תרגילים מהעמודות muscle_img_url ו-movement_img_url בטבלה exercise_db ב-Supabase.
  הנתונים נמשכים דרך הפונקציה nt_exercise_media (supabase/reporting.sql) ונשמרים מקומית, כך שהתמונות
  מוצגות גם בלי רשת. המבנה: { מפתח-תרגיל: { משתמש: { m, v } } }
*/
const KEY = 'nt2:media';
let data = LS.get(KEY, {});
let ver = 0;
const subs = new Set();

const safe = (u) => (typeof u === 'string' && /^https?:\/\/\S+$/i.test(u.trim()) ? u.trim() : '');
/* מזהה המסמך הוא 'ex:משתמש:מפתח'. המפתח הוא מזהה התרגיל באפליקציה */
const exKey = (id) => String(id).split(':').slice(2).join(':');

export const Media = {
  subscribe(f) { subs.add(f); return () => subs.delete(f); },
  version: () => ver,
  set(rows) {
    const next = {};
    (rows || []).forEach((r) => {
      const k = exKey(r.id);
      const m = safe(r.muscle_img_url);
      const v = safe(r.movement_img_url);
      if (!k || (!m && !v)) return;
      (next[k] = next[k] || {})[r.usr] = { m, v };
    });
    if (JSON.stringify(next) === JSON.stringify(data)) return;
    data = next;
    LS.set(KEY, data);
    ver++;
    subs.forEach((f) => f());
  },
  /* של המשתמש עצמו קודם, ואם אין, של המשתמש השני (אותו תרגיל בספרייה) */
  get(user, exId) {
    const e = data[exId];
    if (!e) return { m: '', v: '' };
    const mine = e[user] || {};
    const other = Object.values(e).find((x) => x.m || x.v) || {};
    return { m: mine.m || other.m || '', v: mine.v || other.v || '' };
  },
};

export const useExerciseMedia = () => {
  useSyncExternalStore(Media.subscribe, Media.version);
  return Media;
};
