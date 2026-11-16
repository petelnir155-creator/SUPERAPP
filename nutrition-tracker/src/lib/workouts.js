import { DEMO_EXERCISES, EX_CATS } from './exercises.js';
import { PROFILES } from './config.js';
import { stem, words } from './parser.js';
import { Store } from './store.js';
import { LS, norm, r1, uid } from './utils.js';

/*
  אימונים ומשמרות הדרכה. שלושה סוגי מסמכים באותה חנות ובאותו סנכרון של התזונה:
    ex    = תרגיל במאגר { id, name, cat (קבוצת שריר), type?, auto? }
    wk    = תרגיל שבוצע ביום { id, date, time, exId, name, cat, type, sets, minutes, speed, km, op }
    shift = משמרת הדרכה { id, date, minutes, op }
  סוגי אימון (type): strength | machine | run | pilates. לכל סוג שדות משלו:
    strength: sets [{ reps, kg, bw }]     machine: minutes + speed (קמ״ש)
    run: km + minutes                      pilates: minutes
  מפתח ה-wk הוא תאריך + תרגיל: כל תרגיל מופיע פעם אחת ביום והנתונים מצטברים בו.
*/
export { EX_CATS };
export const catLabel = (id) => (EX_CATS.find((c) => c.id === id) || { label: id === 'arms' ? 'ידיים' : '' }).label;
export const STRENGTH_CATS = EX_CATS.filter((c) => c.id !== 'cardio' && c.id !== 'pilates');
export const TYPE_LABEL = { strength: 'כוח', machine: 'מכשיר', run: 'ריצה', pilates: 'פילאטיס' };
const wkKey = (date, exId) => date + '_' + exId;

/* סוג התרגיל: מהשדה type, ואם אין (נתונים ישנים) לפי הקטגוריה */
export const typeOf = (x) => x.type || (x.cat === 'cardio' ? 'machine' : x.cat === 'pilates' ? 'pilates' : 'strength');

/* מסמך אימון בצורה אחידה. מסמכי אירובי ישנים (דקות בתוך sets) מומרים לשדה minutes */
export function normLog(w) {
  const type = typeOf(w);
  if (type !== 'strength' && w.minutes == null && w.km == null && Array.isArray(w.sets) && w.sets.length) {
    return { ...w, type, sets: [], minutes: w.sets.reduce((t, s) => t + (s.reps || 0), 0), speed: 0, km: 0 };
  }
  return { ...w, type, sets: type === 'strength' ? w.sets || [] : [], minutes: w.minutes || 0, speed: w.speed || 0, km: w.km || 0 };
}
export const logsOf = (user) => Store.list('wk', user).map(normLog);
export function hasData(w) {
  const t = typeOf(w);
  return t === 'strength' ? !!(w.sets && w.sets.length) : t === 'run' ? w.km > 0 || w.minutes > 0 : w.minutes > 0;
}

/* מאגר ברירת המחדל נזרע פעם אחת לכל משתמש (ts=1, לא נשלח לענן), ותרגילים מהגרסה הקודמת מומרים */
const ARMS_MAP = { x21: 'biceps', x22: 'biceps', x23: 'triceps', x24: 'triceps', x25: 'triceps' };
/* תרגילי הברירת מחדל הכלליים מהגרסאות הקודמות (id: [שם, קטגוריה]). מוסרים אם לא נגעו בהם ולא נעשה בהם שימוש */
const LEGACY_SEEDS = {
  x01: ['לחיצת חזה במוט', 'chest'], x02: ['לחיצת חזה בדמבלים', 'chest'], x03: ['לחיצת חזה בשיפוע', 'chest'], x04: ['פרפר במכונה', 'chest'], x05: ['שכיבות סמיכה', 'chest'],
  x06: ['מתח', 'back'], x07: ['פולי עליון', 'back'], x08: ['חתירה בכבל', 'back'], x09: ['חתירה בדמבל', 'back'], x10: ['דדליפט', 'back'],
  x11: ['לחיצת כתפיים', 'shoulders'], x12: ['הרמות צד', 'shoulders'], x13: ['הרמות קדמיות', 'shoulders'], x14: ['פרפר הפוך', 'shoulders'], x15: ['שראגס', 'shoulders'],
  x16: ['סקוואט', 'legs'], x17: ['לחיצת רגליים', 'legs'], x18: ['דדליפט רומני', 'legs'], x19: ['לאנג׳', 'legs'], x20: ['הרמות שוקיים', 'legs'],
  x21: ['כפיפת מרפקים במוט', 'biceps'], x22: ['כפיפות פטישים', 'biceps'], x23: ['פשיטת מרפקים בכבל', 'triceps'], x24: ['מקבילים', 'triceps'], x25: ['מרפק צרפתי', 'triceps'],
  x26: ['כפיפות בטן', 'abs'], x27: ['הרמות רגליים', 'abs'], x28: ['בטן בכבל', 'abs'], x29: ['פלאנק', 'abs'], x30: ['סיבוב רוסי', 'abs'],
};

export function seedExercises() {
  const done = LS.get('nt2:seeded-ex2', {});
  for (const user of Object.keys(PROFILES)) {
    if (done[user]) continue;
    for (const e of Store.list('ex', user)) {
      let d = null;
      if (e.cat === 'arms') d = { ...e, cat: ARMS_MAP[e.id] || 'biceps' };
      else if (e.cat === 'cardio' && !e.type) {
        d = { ...e, type: 'machine' };
        if (e.id === 'x31' && e.name === 'ריצה') d = { ...e, name: 'ריצת חוץ', type: 'run' };
        if (e.id === 'x32' && e.name === 'הליכה בשיפוע') d = { ...d, name: 'הליכון' };
      }
      if (d) Store.put('ex', user, e.id, d);
    }
    done[user] = true;
  }
  LS.set('nt2:seeded-ex2', done);

  /* גרסה 3: המאגר המקצועי עם הדגשים. תרגילים חדשים נזרעים, והישנים שלא בשימוש מוסרים */
  const done3 = LS.get('nt2:seeded-ex3', {});
  for (const user of Object.keys(PROFILES)) {
    if (done3[user]) continue;
    DEMO_EXERCISES.forEach((x) => Store.seed('ex', user, x.id, x));
    const used = new Set(Store.list('wk', user).map((w) => w.exId));
    for (const e of Store.list('ex', user)) {
      const old = LEGACY_SEEDS[e.id];
      if (old && e.name === old[0] && e.cat === old[1] && !used.has(e.id)) Store.remove('ex', user, e.id);
    }
    done3[user] = true;
  }
  LS.set('nt2:seeded-ex3', done3);
  Store.flush();
}

export const exercisesOf = (user) =>
  Store.list('ex', user).sort(
    (a, b) => EX_CATS.findIndex((c) => c.id === a.cat) - EX_CATS.findIndex((c) => c.id === b.cat) || a.name.localeCompare(b.name, 'he'),
  );

/* התאמת שם חופשי לתרגיל במאגר: שם זהה, ואחרת חפיפת מילים מלאה לכיוון אחד */
const stemSet = (t) => new Set(words(t).filter((w) => !/\d/.test(w)).map(stem));
export function matchExercise(name, list) {
  const n = norm(name);
  if (!n) return null;
  const exact = list.find((e) => norm(e.name) === n || (e.en && norm(e.en) === n));
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
  for (const raw of Store.list('wk', user)) {
    const w = normLog(raw);
    if (w.exId !== exId || !(w.date < beforeDate) || !hasData(w)) continue;
    if (!best || w.date > best.date || (w.date === best.date && (w.time || '') > (best.time || ''))) best = w;
  }
  return best;
}

/* מספרים וסימן × נשארים בסדר שמאל-לימין גם בתוך טקסט עברי */
const ltr = (t) => '\u2066' + t + '\u2069';

/* תיאור קצר של סטים: "60 ק״ג · 3×10" או, אם הסטים שונים, "60×12, 60×10, 55×8" (0 = בלי משקל נוסף) */
export function fmtSets(sets) {
  if (!sets || !sets.length) return '';
  const same = sets.every((s) => s.reps === sets[0].reps && s.kg === sets[0].kg);
  if (same) return (sets[0].kg > 0 ? r1(sets[0].kg) + ' ק״ג' : 'משקל גוף') + ' · ' + ltr(sets.length + '×' + sets[0].reps);
  return sets.map((s) => ltr(r1(s.kg) + '×' + s.reps)).join(', ');
}

export const avgSpeed = (km, min) => (km > 0 && min > 0 ? r1(km / (min / 60)) : 0);

/* תיאור קצר של ביצוע, לפי סוג האימון */
export function fmtLog(w) {
  const t = typeOf(w);
  const bits = [];
  if (t === 'strength') return fmtSets(w.sets);
  if (t === 'run') {
    if (w.km > 0) bits.push(r1(w.km) + ' ק״מ');
    if (w.minutes > 0) bits.push(r1(w.minutes) + ' דק׳');
    const sp = avgSpeed(w.km, w.minutes);
    if (sp > 0) bits.push(sp + ' קמ״ש');
    return bits.join(' · ');
  }
  if (w.minutes > 0) bits.push(r1(w.minutes) + ' דק׳');
  if (t === 'machine' && w.speed > 0) bits.push(r1(w.speed) + ' קמ״ש');
  return bits.join(' · ');
}
export const prevText = (prev) => (prev ? fmtLog(prev) : '');

const clampSet = (s) => {
  const reps = Math.round(Number(s && s.reps));
  const kg = Math.max(0, Math.min(1000, Number(s && s.kg) || 0));
  if (!Number.isFinite(reps) || reps <= 0 || reps > 999) return null;
  return { reps, kg: Math.round(kg * 100) / 100, bw: kg === 0 };
};
const cl = (v, max) => Math.max(0, Math.min(max, Number(v) || 0));

/* החלק של הפעולה שנוסף לסוג שלה, או null אם אין בו מידע שמיש */
function pieceOf(type, a) {
  if (type === 'strength') {
    const sets = (a.sets || []).slice(0, 30).map(clampSet).filter(Boolean);
    return sets.length ? { type, sets } : null;
  }
  const minutes = cl(a.minutes, 600);
  if (type === 'run') {
    const km = cl(a.km, 200);
    return km > 0 || minutes > 0 ? { type, km, minutes } : null;
  }
  if (type === 'machine') return minutes > 0 ? { type, minutes, speed: cl(a.speed, 40) } : null;
  return minutes > 0 ? { type: 'pilates', minutes } : null;
}

function mergePieces(a, b) {
  if (a.type === 'strength') return { ...a, sets: a.sets.concat(b.sets) };
  const minutes = (a.minutes || 0) + (b.minutes || 0);
  let speed = 0;
  if (a.type === 'machine') {
    const wa = a.speed > 0 ? a.minutes : 0;
    const wb = b.speed > 0 ? b.minutes : 0;
    speed = wa + wb > 0 ? Math.round(((a.speed * wa + b.speed * wb) / (wa + wb)) * 10) / 10 : 0;
  }
  return { ...a, minutes, speed, km: (a.km || 0) + (b.km || 0) };
}

const catFor = (type, cat) => (type === 'machine' || type === 'run' ? 'cardio' : type === 'pilates' ? 'pilates' : STRENGTH_CATS.some((c) => c.id === cat) ? cat : 'chest');

/*
  החלת פעולות על החנות. action:
    { type:'strength', exId|null, name, cat, sets } | { type:'machine', ..., minutes, speed }
    { type:'run', ..., km, minutes } | { type:'pilates', ..., minutes } | { type:'shift', minutes }
  תרגיל שחסר במאגר נוצר אוטומטית (auto), כדי שיהיה לו ביצוע קודם להשוואה. משמרות נרשמות רק למי שמוגדרת
  כמדריכה (o.canShift). שליחה עם אותו op לא מתבצעת פעמיים, ונתונים לאותו תרגיל באותו יום מצטברים.
*/
export function applyWorkout(user, actions, o) {
  if (o.op && (Store.list('wk', user).some((w) => w.op === o.op) || Store.list('shift', user).some((s) => s.op === o.op))) {
    return { added: [], shifts: [], snap: [], dup: true };
  }
  const list = exercisesOf(user);
  const byId = Object.fromEntries(list.map((e) => [e.id, e]));
  const ops = [];
  const shifts = [];
  const merged = new Map();
  for (const a of actions) {
    if (a.type === 'shift') {
      const minutes = Math.round(cl(a.minutes, 1440));
      if (!o.canShift || minutes <= 0) continue;
      const id = uid();
      ops.push({ kind: 'shift', user, key: id, d: { id, date: o.today, minutes, op: o.op } });
      shifts.push({ id, minutes });
      continue;
    }
    let ex = a.exId && byId[a.exId] ? byId[a.exId] : matchExercise(a.name, list);
    let created = false;
    const type = ex ? typeOf(ex) : a.type || 'strength';
    const piece = pieceOf(type, a);
    if (!piece) continue;
    if (!ex) {
      const nm = String(a.name || '').trim().slice(0, 60);
      if (!nm) continue;
      ex = { id: uid(), name: nm, cat: catFor(type, a.cat), ...(type === 'strength' ? {} : { type }), auto: true };
      ops.push({ kind: 'ex', user, key: ex.id, d: ex });
      list.push(ex);
      byId[ex.id] = ex;
      created = true;
    }
    const m = merged.get(ex.id);
    if (!m) merged.set(ex.id, { ex, type, piece, pieces: [piece], created });
    else if (JSON.stringify(m.pieces[m.pieces.length - 1]) !== JSON.stringify(piece)) {
      m.pieces.push(piece); // אותה פעולה בדיוק פעמיים באותה הודעה נחשבת כפילות ומדולגת
      m.piece = mergePieces(m.piece, piece);
    }
  }
  const added = [];
  for (const { ex, type, piece, created } of merged.values()) {
    const key = wkKey(o.today, ex.id);
    const raw = Store.get('wk', user, key);
    const cur = raw ? normLog(raw) : null;
    const base = { type, sets: [], minutes: 0, speed: 0, km: 0 };
    const sum = cur && hasData(cur) ? mergePieces({ ...base, ...cur }, piece) : { ...base, ...piece };
    const d = { id: key, date: o.today, time: cur ? cur.time : o.time, exId: ex.id, name: ex.name, cat: ex.cat, type, sets: sum.sets || [], minutes: sum.minutes || 0, speed: sum.speed || 0, km: sum.km || 0, op: o.op };
    ops.push({ kind: 'wk', user, key, d });
    added.push({ id: key, name: ex.name, cat: ex.cat, type, summary: fmtLog({ ...base, ...piece, cat: ex.cat }), created, prev: prevText(lastPerformance(user, ex.id, o.today)) });
  }
  const snap = ops.length ? Store.tx(ops) : [];
  return { added, shifts, snap };
}

/* עריכה ידנית של כרטיס: patch הוא חלק מהשדות (sets / minutes / speed / km) */
export function saveLog(user, date, ex, patch, time) {
  const key = wkKey(date, ex.id);
  const raw = Store.get('wk', user, key);
  const cur = raw ? normLog(raw) : { type: typeOf(ex), sets: [], minutes: 0, speed: 0, km: 0 };
  Store.put('wk', user, key, { ...cur, ...patch, id: key, date, time: raw ? raw.time : time, exId: ex.id, name: ex.name, cat: ex.cat, type: typeOf(ex) });
}
export const removeWorkout = (user, date, exId) => Store.remove('wk', user, wkKey(date, exId));

/* פתיחת כרטיס תרגיל ריק להיום, כדי לראות מיד את הביצוע הקודם. מחזיר את מפתח הכרטיס */
export function startExercise(user, date, ex, time) {
  const key = wkKey(date, ex.id);
  if (!Store.get('wk', user, key)) saveLog(user, date, ex, {}, time);
  return key;
}

const okUrl = (u) => {
  const x = (u || '').trim();
  return /^https?:\/\/\S+$/i.test(x) ? x : '';
};

export function addExercise(user, { id, name, cat, type, en, tips, muscle_img_url, movement_img_url }) {
  const key = id || uid();
  const t = cat === 'cardio' ? type || 'machine' : cat === 'pilates' ? 'pilates' : null;
  const tipList = (tips || []).map((x) => x.trim()).filter(Boolean);
  const enName = (en || '').trim();
  const mUrl = okUrl(muscle_img_url);
  const vUrl = okUrl(movement_img_url);
  Store.put('ex', user, key, {
    id: key, name: name.trim(), cat, ...(t ? { type: t } : {}), ...(enName ? { en: enName } : {}), ...(tipList.length ? { tips: tipList } : {}),
    ...(mUrl ? { muscle_img_url: mUrl } : {}), ...(vUrl ? { movement_img_url: vUrl } : {}),
  });
}

/* ---------- משמרות הדרכה ---------- */
export const shiftsOf = (user) => Store.list('shift', user);
export const removeShift = (user, id) => Store.remove('shift', user, id);
export function weekStartKey(date) {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() - d.getDay()); // שבוע ישראלי: מיום ראשון
  return d.toLocaleDateString('en-CA');
}
export function shiftTotals(user, today) {
  const ws = weekStartKey(today);
  const mo = today.slice(0, 7);
  let week = 0;
  let month = 0;
  for (const s of shiftsOf(user)) {
    if (s.date >= ws && s.date <= today) week += s.minutes;
    if (s.date.startsWith(mo) && s.date <= today) month += s.minutes;
  }
  return { week, month };
}
export const fmtHours = (min) => r1(min / 60);

/* ---------- עבודה: משמרות ידניות עם תעריף והערה (אותו סוג מסמך "shift") ---------- */
export function addShift(user, { date, hours, rate, note }) {
  const minutes = Math.round(hours * 60);
  if (!date || !(minutes > 0)) return null;
  const id = uid();
  Store.put('shift', user, id, { id, date, minutes, rate: rate > 0 ? rate : 0, note: (note || '').trim() });
  return id;
}
export const shiftAmount = (s) => ((s.minutes || 0) / 60) * (s.rate || 0);
export function monthShiftSummary(user, ym) {
  let minutes = 0;
  let amount = 0;
  for (const s of shiftsOf(user)) {
    if (s.date.startsWith(ym)) {
      minutes += s.minutes || 0;
      amount += shiftAmount(s);
    }
  }
  return { minutes, amount };
}
export const lastRate = (user) => {
  const l = shiftsOf(user).filter((s) => s.rate > 0).sort((a, b) => b.date.localeCompare(a.date))[0];
  return l ? l.rate : 0;
};
export const fmtMoney = (n) => (Math.round(n * 100) / 100).toLocaleString('he-IL', { maximumFractionDigits: 2 }) + ' ₪';

/* ---------- ניתוח מקומי (בלי AI) ---------- */
const NUM = '(\\d+(?:[.,]\\d+)?)';
const KG = new RegExp(NUM + '\\s*(?:ק["״\']?ג|קילוגרם|קילו|kg)(?![֐-׿])', 'i');
const SPEED = new RegExp(NUM + '\\s*(?:קמ["״\']?ש|קמש|קילומטר(?:ים)?\\s*בשעה|km/h)', 'i');
const SPEED2 = new RegExp('מהירות\\s*(?:של|ממוצעת)?\\s*' + NUM);
const KM = new RegExp(NUM + '\\s*(?:קילומטרים|קילומטר|ק["״\']?מ(?!["״\']?ש))');
const SETS_OF = /(\d+)\s*(?:סטים|סט)\s*(?:של)?\s*(\d+)(?:\s*חזרות)?/;
const TIMES = /(\d+)\s*[xX×]\s*(\d+)/;
const MIN = new RegExp(NUM + '\\s*(?:דקות|דקה|דק[׳\'"]?)');
const HOURS = new RegExp(NUM + '\\s*(?:שעות|שעה)');
const TEACH = /(?:^|\s)(?:העברתי|הדרכתי|לימדתי|העברנו)(?:\s|$)/;
const FILLER = new Set(['עשיתי', 'עם', 'ואז', 'אחר', 'כך', 'משקל', 'גוף', 'חזרות', 'חזרה', 'של', 'ב', 'ו', 'גם', 'עוד', 'במהירות', 'מהירות', 'ממוצעת', 'בקצב', 'במשך', 'למשך', 'כ', 'רצתי', 'התאמנתי']);
const f = (s) => parseFloat(String(s).replace(',', '.'));

export function localWorkout(text, ctx) {
  const list = ctx.exercises;
  const actions = [];
  const unknown = [];
  const segs = text.split(/[,;\n]|\s+ואז\s+|\s+ואחר כך\s+|\s+ו(?=\S+\s+\d)/).map((x) => x.trim()).filter(Boolean);
  for (const seg of segs) {
    if (TEACH.test(' ' + seg + ' ')) {
      if (!ctx.canShift) {
        unknown.push(seg);
        continue;
      }
      const h = seg.match(HOURS);
      const m = seg.match(MIN);
      const minutes = /שעתיים/.test(seg) ? 120 : h ? f(h[1]) * 60 : m ? f(m[1]) : 0;
      if (minutes > 0) actions.push({ type: 'shift', minutes });
      else unknown.push(seg);
      continue;
    }
    let rest = seg;
    const take = (re) => {
      const m = rest.match(re);
      if (m) rest = rest.replace(m[0], ' ');
      return m;
    };
    const kg = (take(KG) || [0, 0])[1];
    const sp = take(SPEED) || take(SPEED2);
    const km = take(KM);
    const mm = take(MIN);
    const ms = take(SETS_OF) || take(TIMES);
    const name = rest.replace(/[-־]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !FILLER.has(norm(w)) && !/^\d+(?:[.,]\d+)?$/.test(w)).join(' ');
    let ex = matchExercise(name, list);
    if (!ex && /ריצה|רצתי/.test(seg)) ex = list.find((e) => e.type === 'run') || null;
    if (!ex && /פילאטיס/.test(seg)) ex = list.find((e) => e.type === 'pilates') || null;
    if (!ex) {
      if (name) unknown.push(name);
      continue;
    }
    const base = { exId: ex.id, name: ex.name, cat: ex.cat };
    const type = typeOf(ex);
    const minutes = mm ? f(mm[1]) : 0;
    if (type === 'strength') {
      const n = ms ? parseInt(ms[1], 10) : 0;
      const reps = ms ? parseInt(ms[2], 10) : 0;
      if (n > 0 && reps > 0) actions.push({ ...base, type, sets: Array.from({ length: Math.min(n, 30) }, () => ({ reps, kg: f(kg) })) });
      else unknown.push(seg);
    } else if (type === 'run') {
      if (km || minutes) actions.push({ ...base, type, km: km ? f(km[1]) : 0, minutes });
      else unknown.push(seg);
    } else if (minutes > 0) actions.push({ ...base, type, minutes, speed: sp ? f(sp[1]) : 0 });
    else unknown.push(seg);
  }
  return { actions, unknown };
}
