import { CATS, MEAL_TIME } from './config.js';

export const LS = {
  get(k, fallback) {
    try {
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch (e) {
      return false;
    }
  },
};

export const todayKey = () => new Date().toLocaleDateString('en-CA');
export const nowTime = () => new Date().toTimeString().slice(0, 5);
export const autoMeal = () => {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return 'breakfast';
  if (h >= 11 && h < 16) return 'lunch';
  if (h >= 18 && h < 23) return 'dinner';
  return 'snack';
};
export const mealTime = (date, meal) => (date === todayKey() ? nowTime() : MEAL_TIME[meal] || '12:00');

export const r1 = (n) => Math.round(n * 10) / 10;
export const r2 = (n) => Math.round(n * 1000) / 1000;
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
export const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
export const fmtN = (n) => Math.round(n).toLocaleString('he-IL');
export const norm = (t) => String(t || '').toLowerCase().replace(/[׳'"״`-]/g, '').trim();
export const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const catOf = (f) => (CATS.some((c) => c.id === f.cat) ? f.cat : f.p >= 10 ? 'protein' : 'carb');
export const sumM = (rows) =>
  rows.reduce((t, e) => ({ kcal: t.kcal + e.kcal, p: t.p + e.p, c: t.c + e.c, f: t.f + e.f }), { kcal: 0, p: 0, c: 0, f: 0 });
export const gramsOf = (food, qty, unit) => (unit === 'serving' ? qty * (food.serving || 100) : qty);
export const macrosOf = (food, grams) => {
  const m = grams / 100;
  return { kcal: food.kcal * m, p: food.p * m, c: food.c * m, f: food.f * m };
};
export const fmtDay = (d, opts) =>
  new Date(d + 'T12:00:00').toLocaleDateString('he-IL', opts || { weekday: 'long', day: 'numeric', month: 'long' });

export function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  } catch (e) {
    /* fall through */
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } catch (e) {
    /* ignore */
  }
  document.body.removeChild(ta);
  return Promise.resolve();
}
