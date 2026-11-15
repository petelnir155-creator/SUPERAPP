import { LS } from './utils.js';

const KEY = 'nt2:theme'; // 'dark' | 'light'
const COLORS = { dark: '#0a0c0f', light: '#f4f5f7' };

export const getTheme = () => (LS.get(KEY, 'dark') === 'light' ? 'light' : 'dark');

/* מחיל את הערכה על המסמך: מחלקת dark על html, ‏theme-color של הדפדפן */
export function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', COLORS[theme]);
}

export function saveTheme(theme) {
  LS.set(KEY, theme);
  applyTheme(theme);
}
