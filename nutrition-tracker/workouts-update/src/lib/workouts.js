import { DEMO_EXERCISES, EX_CATS } from './exercises.js';
import { PROFILES } from './config.js';
import { stem, words } from './parser.js';
import { Store } from './store.js';
import { LS, norm, r1, uid } from './utils.js';

/*
  אימונים. שני סוגי מסמכים באותה חנות ובאותו סנכרון של התזונה (בלי טבלאות נוספות):
    ex  = תרגיל במאגר      { id, name, cat, auto? }
    wk  = תרגיל שבוצע ביום { id, date, time, exId, name, cat, sets:[{ reps, kg, bw }], op }
  מפתח ה-wk הוא תאריך + תרגיל, כך שכל תרגיל מופיע פעם אחת ביום והסטים מצטברים בו.
  באירובי השדה reps הוא דקות.
*/
export { EX_CATS };
export const catLabel = (id) => (EX_CATS.find((c) => c.id === id) || { label: '' }).label;
export const isCardio = (cat) => cat === 'cardio';
const wkKey = (date, exId) => date + '_' + exId;

/* מאגר ברירת המחדל נזרע פעם אחת לכל משתמש (ts=1, לא נשלח לענן) */
export function seedExercises() {
  const seeded = LS.get('nt2:seeded-ex', {});
  for (const user of Object.keys(PROFILES)) {
    if (seeded[user]) continue;
    DEMO_EXERCISES.forEach((x) => Store.seed('ex', user, x.id, x));
    seeded[user] = true;
  }
  LS.set('nt2:seeded-ex', seeded);
  Store.flush();
}

export const exercisesOf = (user) =>
  Store.list('ex', user).sort((a, b) => EX_CATS.findIndex((c) => c.id === a.cat) - EX_CATS.findIndex((c) => c.id === b.cat) || a.name.localeCompare(b.name, 'he'));

/* התאמת שם חופשי לתרגיל במאגר: שם זהה, ואחרת חפיפת מילים מלאה לכיוון אחד */
const stemSet = (t) => new Set(words(t).filter((w) => !/\d/.test(w)).map(stem));
export function matchExercise(name, list) {
  const n = norm(name);
  if (!n) return null;
  const exact = list.find((e) => norm(e.name) === n);
  if (exact) return exact;
  const q = stemSet(name);
  if (!q.size) return null;
  let best = null;
  let bestScore = 0;
  for (const e of list) {
    const s = stemSet(e.name);
    const common = [...q].filter((w) => s.has(w)).length;
    if (!common || (common < q.size && common < s.size)) continue;
    const score = common / Math.max(q.size, s.size);
    if (score > bestScore) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}

/* ביצוע אחרון של תרגיל לפני תאריך מסוים: הבסיס ל-Progressive Overload */
export function lastPerformance(user, exId, beforeDate) {
  let best = null;
  for (const w of Store.list('wk', user)) {
    if (w.exId !== exId || !(w.date < beforeDate) || !w.sets || !w.sets.length) continue;
    if (!best || w.date > best.date || (w.date === best.date && (w.time || '') > (best.time || ''))) best = w;
  }
  return best;
}

/* מספרים וסימן × נשארים בסדר שמאל-לימין גם בתוך טקסט עברי */
const ltr = (t) => '\u2066' + t + '\u2069';

/* תיאור קצר של סטים: "60 ק״ג · 3×10" או, אם הסטים שונים, "60×12, 60×10, 55×8" */
export function fmtSets(sets, cat) {
  if (!sets || !sets.length) return '';
  if (isCardio(cat)) return sets.map((s) => r1(s.reps) + ' דק׳').join(', ');
  const same = sets.every((s) => s.reps === sets[0].reps && s.kg === sets[0].kg);
  if (same) return (sets[0].kg > 0 ? r1(sets[0].kg) + ' ק״ג' : 'משקל גוף') + ' · ' + ltr(sets.length + '×' + sets[0].reps);
  return sets.map((s) => ltr(r1(s.kg) + '×' + s.reps)).join(', '); // 0 = בלי משקל נוסף
}
export const prevText = (prev) => (prev ? fmtSets(prev.sets, prev.cat) : '');

const clampSet = (s, cardio) => {
  const reps = Math.round(Number(s && s.reps));
  const kg = cardio ? 0 : Math.max(0, Math.min(1000, Number(s && s.kg) || 0));
  if (!Number.isFinite(reps) || reps <= 0 || reps > (cardio ? 600 : 999)) return null;
  return { reps, kg: Math.round(kg * 100) / 100, bw: !cardio && kg === 0 };
};

/*
  החלת פעולות אימון על החנות. action: { exId|null, name, cat, sets:[{reps,kg}] }
  תרגיל שחסר במאגר נוצר אוטומטית (auto) כדי שהביצוע שלו יישמר ויהיה זמין להשוואה בפעם הבאה.
  שליחה עם אותו op לא מתבצעת פעמיים. סטים מתווספים לתרגיל שכבר קיים באותו יום.
*/
export function applyWorkout(user, actions, o) {
  const all = Store.list('wk', user);
  if (o.op && all.some((w) => w.op === o.op)) return { added: [], snap: [], dup: true };
  const list = exercisesOf(user);
  const byId = Object.fromEntries(list.map((e) => [e.id, e]));
  const ops = [];
  const added = [];
  const merged = new Map();
  for (const a of actions) {
    let ex = a.exId && byId[a.exId] ? byId[a.exId] : matchExercise(a.name, list);
    let created = false;
    if (!ex) {
      const nm = String(a.name || '').trim().slice(0, 60);
      if (!nm) continue;
      ex = { id: uid(), name: nm, cat: EX_CATS.some((c) => c.id === a.cat) ? a.cat : 'chest', auto: true };
      ops.push({ kind: 'ex', user, key: ex.id, d: ex });
      list.push(ex);
      byId[ex.id] = ex;
      created = true;
    }
    const sets = (a.sets || []).slice(0, 30).map((s) => clampSet(s, isCardio(ex.cat))).filter(Boolean);
    if (!sets.length) continue;
    const m = merged.get(ex.id);
    if (m) {
      if (JSON.stringify(m.sets) !== JSON.stringify(sets)) m.sets = m.sets.concat(sets); // אותו תרגיל פעמיים באותה הודעה: לא להכפיל סטים זהים
    } else merged.set(ex.id, { ex, sets, created });
  }
  for (const { ex, sets, created } of merged.values()) {
    const key = wkKey(o.today, ex.id);
    const cur = Store.get('wk', user, key);
    const prev = lastPerformance(user, ex.id, o.today);
    const d = {
      id: key, date: o.today, time: cur ? cur.time : o.time, exId: ex.id, name: ex.name, cat: ex.cat,
      sets: (cur ? cur.sets : []).concat(sets), op: o.op,
    };
    ops.push({ kind: 'wk', user, key, d });
    added.push({ id: key, name: ex.name, cat: ex.cat, sets, created, prev: prevText(prev) });
  }
  const snap = ops.length ? Store.tx(ops) : [];
  return { added, snap };
}

/* עריכה ידנית של סטים בכרטיס תרגיל (כרטיס בלי סטים נשאר, כדי שאפשר להוסיף אליו) */
export function saveSets(user, date, ex, sets, time) {
  const key = wkKey(date, ex.id);
  const cur = Store.get('wk', user, key);
  Store.put('wk', user, key, { id: key, date, time: cur ? cur.time : time, exId: ex.id, name: ex.name, cat: ex.cat, sets, op: cur ? cur.op : undefined });
}
export const removeWorkout = (user, date, exId) => Store.remove('wk', user, wkKey(date, exId));

/* פתיחת כרטיס תרגיל ריק להיום, כדי לראות מיד את הביצוע הקודם */
export function startExercise(user, date, ex, time) {
  const key = wkKey(date, ex.id);
  if (Store.get('wk', user, key)) return;
  Store.put('wk', user, key, { id: key, date, time, exId: ex.id, name: ex.name, cat: ex.cat, sets: [] });
}

export function addExercise(user, { id, name, cat }) {
  const key = id || uid();
  Store.put('ex', user, key, { id: key, name: name.trim(), cat });
}

/* ---------- ניתוח מקומי (בלי AI) ---------- */
const KG = /(\d+(?:[.,]\d+)?)\s*(?:ק["״']?ג|קילוגרם|קילו|kg)(?![֐-׿])/i;
const SETS_OF = /(\d+)\s*(?:סטים|סט)\s*(?:של)?\s*(\d+)(?:\s*חזרות)?/;
const TIMES = /(\d+)\s*[xX×]\s*(\d+)/;
const MIN = /(\d+(?:[.,]\d+)?)\s*(?:דקות|דקה|דק[׳'"]?)/;
const FILLER = new Set(['עשיתי', 'עם', 'ואז', 'אחר', 'כך', 'משקל', 'גוף', 'חזרות', 'חזרה', 'של', 'ב', 'ו', 'גם', 'עוד']);

export function localWorkout(text, ctx) {
  const list = ctx.exercises;
  const actions = [];
  const unknown = [];
  const segs = text.split(/[,;\n]|\s+ואז\s+|\s+ואחר כך\s+|\s+ו(?=\S+\s+\d)/).map((x) => x.trim()).filter(Boolean);
  for (const seg of segs) {
    let rest = seg;
    let kg = 0;
    let n = 0;
    let reps = 0;
    let mins = 0;
    const take = (re) => {
      const m = rest.match(re);
      if (m) rest = rest.replace(m[0], ' ');
      return m;
    };
    const mk = take(KG);
    if (mk) kg = parseFloat(mk[1].replace(',', '.'));
    const mm = take(MIN);
    if (mm) mins = parseFloat(mm[1].replace(',', '.'));
    const ms = take(SETS_OF) || take(TIMES);
    if (ms) {
      n = parseInt(ms[1], 10);
      reps = parseInt(ms[2], 10);
    }
    const name = rest.split(/\s+/).filter((w) => w && !FILLER.has(norm(w)) && !/^\d+$/.test(w)).join(' ');
    const ex = matchExercise(name, list);
    if (!ex || !name) {
      if (name) unknown.push(name);
      continue;
    }
    if (isCardio(ex.cat)) {
      if (mins > 0) actions.push({ exId: ex.id, name: ex.name, cat: ex.cat, sets: [{ reps: mins, kg: 0 }] });
      else unknown.push(seg);
    } else if (n > 0 && reps > 0) {
      actions.push({ exId: ex.id, name: ex.name, cat: ex.cat, sets: Array.from({ length: Math.min(n, 30) }, () => ({ reps, kg })) });
    } else unknown.push(seg);
  }
  return { actions, unknown };
}
