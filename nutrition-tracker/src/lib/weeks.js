/*
  שבועות ראשון עד שבת, על מפתחות תאריך YYYY-MM-DD (בלי תלות באזור זמן).
*/
const toDate = (k) => new Date(k + 'T12:00:00Z');
const key = (d) => d.toISOString().slice(0, 10);
export const addDays = (k, n) => {
  const d = toDate(k);
  d.setUTCDate(d.getUTCDate() + n);
  return key(d);
};
/* יום ראשון של השבוע שמכיל את התאריך */
export const weekStart = (k) => addDays(k, -toDate(k).getUTCDay());

export const range = (a, b) => {
  const out = [];
  for (let k = a; k <= b; k = addDays(k, 1)) out.push(k);
  return out;
};

/* השבוע הנוכחי: מיום ראשון ועד אתמול. ביום ראשון הרשימה ריקה */
export function currentWeek(today) {
  const start = weekStart(today);
  return { start, end: addDays(start, 6), days: range(start, addDays(today, -1)) };
}

/* שבועות קודמים מלאים (ראשון עד שבת), החדש ראשון. לא יורדים מתחת לשבוע של firstDate */
export function pastWeeks(today, firstDate) {
  const out = [];
  const floor = weekStart(firstDate);
  for (let s = addDays(weekStart(today), -7); s >= floor; s = addDays(s, -7)) {
    out.push({ start: s, end: addDays(s, 6), days: range(s, addDays(s, 6)) });
  }
  return out;
}

/* 15.11 */
export const dm = (k) => k.slice(8, 10) + '.' + k.slice(5, 7);
export const rangeLabel = (w) => dm(w.start) + '–' + dm(w.end);
