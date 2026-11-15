import { escRe, gramsOf, macrosOf, norm } from './utils.js';

/*
  ניתוח מקומי (בלי AI). כל פונקציה מחזירה פעולות במבנה אחד:
    { action: 'add', name, foodId|null, qty, unit, g, kcal, p, c, f, est }
    { action: 'update', id, grams }
*/
const NUMW = {
  אחד: 1, אחת: 1, שני: 2, שתי: 2, שניים: 2, שתיים: 2, שלוש: 3, שלושה: 3, ארבע: 4, ארבעה: 4, חמש: 5, חמישה: 5,
  שש: 6, שישה: 6, שבע: 7, שבעה: 7, שמונה: 8, תשע: 9, תשעה: 9, עשר: 10, עשרה: 10, חצי: 0.5, רבע: 0.25,
};
const UNIT_G = { כוס: 240, כוסות: 240, כף: 15, כפות: 15, כפית: 5, כפיות: 5 };
const SKIP = new Set([
  'אכלתי', 'אכלנו', 'שתיתי', 'שתינו', 'לקחתי', 'הרגע', 'היום', 'בבוקר', 'בצהריים', 'בערב', 'בערך', 'עוד', 'גם',
  'של', 'את', 'מנה', 'מנות', 'יחידה', 'יחידות', 'פרוסה', 'פרוסות', 'חתיכה', 'חתיכות', 'כ', 'אני', 'בסוף', 'בעצם',
  'למעשה', 'תקן', 'תתקן', 'שנה', 'תשנה', 'עדכן', 'תעדכן', 'התכוונתי', 'היה', 'הייתה',
]);
// ערכים מקורבים ל-100 גרם למאכלים נפוצים שאינם במאגר
const EST = [
  { name: 'סלט ירקות', alias: 'סלט', kcal: 20, p: 1, c: 3.5, f: 0.2, serving: 150 },
  { name: 'לחם', alias: 'טוסט פרוסה', kcal: 265, p: 9, c: 49, f: 3.2, serving: 30 },
  { name: 'פיתה', alias: '', kcal: 275, p: 9, c: 55, f: 1.2, serving: 90 },
  { name: 'פסטה מבושלת', alias: 'ספגטי', kcal: 158, p: 5.8, c: 31, f: 0.9, serving: 150 },
  { name: 'תפוח עץ', alias: 'תפוח', kcal: 52, p: 0.3, c: 14, f: 0.2, serving: 180 },
  { name: 'בננה', alias: '', kcal: 89, p: 1.1, c: 23, f: 0.3, serving: 120 },
  { name: 'אבוקדו', alias: '', kcal: 160, p: 2, c: 8.5, f: 14.7, serving: 100 },
  { name: 'גבינה צהובה', alias: 'גבינה', kcal: 350, p: 25, c: 1.3, f: 27, serving: 30 },
  { name: 'יוגורט', alias: '', kcal: 60, p: 3.5, c: 4.7, f: 3, serving: 150 },
  { name: 'חומוס', alias: '', kcal: 166, p: 8, c: 14, f: 10, serving: 60 },
  { name: 'טחינה', alias: '', kcal: 595, p: 17, c: 21, f: 54, serving: 15 },
  { name: 'שמן זית', alias: 'שמן', kcal: 884, p: 0, c: 0, f: 100, serving: 10 },
  { name: 'עגבנייה', alias: 'עגבניות', kcal: 18, p: 0.9, c: 3.9, f: 0.2, serving: 100 },
  { name: 'תפוח אדמה', alias: 'תפוד', kcal: 87, p: 1.9, c: 20, f: 0.1, serving: 150 },
  { name: 'בטטה', alias: '', kcal: 90, p: 2, c: 21, f: 0.1, serving: 150 },
  { name: 'שוקולד', alias: '', kcal: 535, p: 7.7, c: 59, f: 30, serving: 20 },
  { name: 'אגוזים', alias: 'שקדים אגוז', kcal: 600, p: 18, c: 15, f: 53, serving: 30 },
];

export const words = (t) => norm(t).split(/[\s/]+/).filter(Boolean);
export const stem = (w) => {
  let x = String(w).toLowerCase().replace(/[֑-ׇ]/g, '').replace(/יי/g, 'י');
  if (x.length > 3 && x[0] === 'ה') x = x.slice(1);
  if (x.length > 4 && /(ים|ות)$/.test(x)) x = x.slice(0, -2);
  else if (x.length > 3 && /[הת]$/.test(x)) x = x.slice(0, -1);
  return x;
};

export function matchFood(query, list) {
  const qs = words(query).filter((w) => !/\d/.test(w)).map(stem).filter((x) => x.length >= 2);
  if (!qs.length) return null;
  const hit = (a, arr) => arr.some((b) => a === b || (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))));
  let best = null;
  let bestScore = 0;
  for (const f of list) {
    const fs = words(f.name + ' ' + (f.alias || '')).filter((w) => !/\d/.test(w)).map(stem);
    if (!fs.length) continue;
    const qHit = qs.filter((x) => hit(x, fs)).length;
    if (qHit < Math.max(1, qs.length - (qs.length >= 3 ? 1 : 0))) continue;
    const nameFs = words(f.name).filter((w) => !/\d/.test(w)).map(stem);
    const score = qHit / qs.length + nameFs.filter((x) => hit(x, qs)).length / (nameFs.length || 1);
    if (score > bestScore) {
      best = f;
      bestScore = score;
    }
  }
  return best;
}

/*
  שמות מאכלים שמכילים "עם" (למשל "הפוך עם מייפל") הם פריט אחד. מסמנים אותם לפני הפיצול,
  אחרת "עם" מפצל אותם לשני חלקים ושניהם מתאימים לאותו מאכל במאגר. זו הייתה סיבת הכפילות.
*/
const JOIN = '‿';
export function protectNames(text, foods) {
  let t = text;
  for (const f of foods) {
    const parts = f.name.split(/\s+עם\s+/);
    if (parts.length !== 2 || !parts[0] || !parts[1]) continue;
    const re = new RegExp(escRe(parts[0]) + '\\s+עם\\s+' + escRe(parts[1]), 'g');
    t = t.replace(re, (m) => m.replace(/\s+עם\s+/, JOIN));
  }
  return t;
}

const QUNIT = /^(גרם|גרמים|גר׳|גר'|גר|ג|קג|ק״ג|קילו|מל|מ״ל|כוס|כוסות|כף|כפות|כפית|כפיות|מנה|מנות|יחידה|יחידות|פרוסה|פרוסות)$/;

export function splitSegments(text) {
  const parts = text
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/\s+(?:ועוד|וגם|ובנוסף|ואז|ואחר כך|אחר כך)\s+/g, ',')
    .replace(/\s+ו-?(?=\d)/g, ',')
    .replace(/\s+ו-(?=[א-ת])/g, ',')
    .split(/[,;+\n]|\s+עם\s+|\s+ו(?=[א-ת]{2,})/)
    .map((x) => x.trim())
    .filter(Boolean);
  // כמה כמויות באותו קטע בלי מילת חיבור: "150 גרם חזה עוף 200 גרם קינואה"
  const out = [];
  for (const seg of parts) {
    let cur = [];
    let hasNum = false;
    let foodAfter = false;
    for (const t of seg.split(/\s+/)) {
      const isNum = /^\d+(?:\.\d+)?$/.test(t);
      if (isNum && hasNum && foodAfter) {
        out.push(cur.join(' '));
        cur = [];
        hasNum = false;
        foodAfter = false;
      }
      if (isNum) hasNum = true;
      else if (hasNum && !QUNIT.test(t.replace(/["']/g, ''))) foodAfter = true;
      cur.push(t);
    }
    if (cur.length) out.push(cur.join(' '));
  }
  return out.map((s) => s.split(JOIN).join(' עם '));
}

export function parseQty(seg) {
  let s = ' ' + seg.replace(/(\d),(\d)/g, '$1.$2') + ' ';
  let grams = null;
  let m;
  if ((m = s.match(/(\d+(?:\.\d+)?)\s*(?:ק["״']?ג|קילוגרם|קילו)(?![א-ת])/))) {
    grams = parseFloat(m[1]) * 1000;
    s = s.replace(m[0], ' ');
  } else if ((m = s.match(/(\d+(?:\.\d+)?)\s*(?:גרמים|גרם|גר[׳']?|gr?(?![a-z]))(?![א-ת])/i))) {
    grams = parseFloat(m[1]);
    s = s.replace(m[0], ' ');
  } else if ((m = s.match(/(\d+(?:\.\d+)?)\s*(?:מ["״']?ל|מיליליטר|ml)(?![א-ת])/i))) {
    grams = parseFloat(m[1]);
    s = s.replace(m[0], ' ');
  }
  let count = null;
  let unitG = null;
  if ((m = s.match(/(\d+)\s*\/\s*(\d+)/))) {
    count = parseInt(m[1], 10) / (parseInt(m[2], 10) || 1);
    s = s.replace(m[0], ' ');
  }
  const rest = [];
  for (const w of s.split(/\s+/).filter(Boolean)) {
    const nw = w.replace(/[״"׳']/g, '');
    if (count === null && /^\d+(\.\d+)?$/.test(nw)) { count = parseFloat(nw); continue; }
    if (count === null && NUMW[nw] !== undefined) { count = NUMW[nw]; continue; }
    if (unitG === null && UNIT_G[nw] !== undefined) { unitG = UNIT_G[nw]; continue; }
    if (SKIP.has(nw)) continue;
    rest.push(w);
  }
  return { grams, count, unitG, rest: rest.join(' ') };
}

const stemSet = (t) => new Set(words(t).filter((w) => !/\d/.test(w)).map(stem));
const wordCount = (t) => stemSet(t).size;
function exactEst(query) {
  const q = stemSet(query);
  if (!q.size) return null;
  return EST.find((e) => {
    const name = stemSet(e.name);
    const sameName = name.size === q.size && [...q].every((w) => name.has(w));
    const alias = q.size === 1 && stemSet(e.alias || '').has([...q][0]);
    return sameName || alias;
  }) || null;
}

/* הוספה: כל חלק במשפט מותאם למאגר, ואם אין התאמה לטבלת ההערכות */
function localParse(text, foods) {
  const items = [];
  const unknown = [];
  for (const seg of splitSegments(protectNames(text, foods))) {
    const q = parseQty(seg);
    if (!q.rest) { unknown.push(seg); continue; }
    let src = matchFood(q.rest, foods);
    let est = false;
    // "תפוח" הוא תפוח עץ ולא "תפוח אדמה": כינוי מדויק בטבלת ההערכות גובר על התאמה חלקית למאגר
    const exact = exactEst(q.rest);
    if (exact && (!src || wordCount(src.name) > wordCount(q.rest))) { src = exact; est = true; }
    if (!src) { src = matchFood(q.rest, EST); est = !!src; }
    if (!src) { unknown.push(q.rest); continue; }
    let qty;
    let unit;
    if (q.grams !== null) { qty = q.grams; unit = 'gram'; }
    else if (q.unitG !== null) { qty = (q.count === null ? 1 : q.count) * q.unitG; unit = 'gram'; }
    else { qty = q.count === null ? 1 : q.count; unit = 'serving'; }
    if (!(qty > 0)) { unknown.push(seg); continue; }
    const g = gramsOf(src, qty, unit);
    const m = macrosOf(src, g);
    if (est) items.push({ action: 'add', foodId: null, name: src.name, qty: g, unit: 'gram', g, est: true, ...m });
    else items.push({ action: 'add', foodId: src.id, name: src.name, qty, unit, g, est: false, ...m });
  }
  return { items, unknown };
}

/* תיקון של פריט שכבר נרשם היום: "אכלתי בסוף 200 גרם בטטה ולא 150" */
const FIX_CUE = /(^|\s)(ולא|במקום|בעצם|תקן|תתקן|שנה|תשנה|עדכן|תעדכן|התכוונתי)(?=\s|$)/;

export function localActions(text, ctx) {
  const entries = ctx.entries.slice().sort((a, b) => (b.time || '').localeCompare(a.time || ''));
  // החלק שאחרי "ולא" הוא הערך הישן ואסור שייספר כפריט
  const t = text.replace(/\s+(?:ולא|במקום)\s+\d.*$/, '');
  if (FIX_CUE.test(text) && entries.length) {
    const updates = [];
    const used = new Set();
    for (const seg of splitSegments(protectNames(t, ctx.foods))) {
      const q = parseQty(seg);
      if (!q.rest) continue;
      const e = matchFood(q.rest, entries);
      if (!e || used.has(e.id)) continue;
      const serving = e.unit === 'serving' && e.qty > 0 ? e.g / e.qty : null;
      let g = null;
      if (q.grams !== null) g = q.grams;
      else if (q.unitG !== null) g = (q.count === null ? 1 : q.count) * q.unitG;
      else if (q.count !== null && serving) g = q.count * serving;
      if (!(g > 0)) continue;
      used.add(e.id);
      updates.push({ action: 'update', id: e.id, grams: g });
    }
    if (updates.length) return { actions: updates, unknown: [] };
  }
  const r = localParse(t, ctx.foods);
  return { actions: r.items, unknown: r.unknown };
}
