export const APP_NAME = 'סופר א פטל';
export const STEP_GOAL = 6000; // יעד צעדים ראשי
export const STEP_BONUS = 8000; // יעד בונוס
export const STEP_SLIDER_MAX = 15000; // טווח הסליידר
export const CUP_ML = 350; // כוס אחת במ״ל
export const CUP_GOAL = 8; // יעד כוסות ליום (2,800 מ״ל)
export const WAIST_GOAL = 100;

export const OVER = 'var(--color-over)';

export const METRICS = [
  { key: 'kcal', label: 'קלוריות', unit: 'קק״ל', color: '#818CF8' },
  { key: 'p', label: 'חלבון', unit: 'גר׳', color: '#4ADE80', okOver: true },
  { key: 'c', label: 'פחמימות', unit: 'גר׳', color: '#FBBF24' },
  { key: 'f', label: 'שומן', unit: 'גר׳', color: '#C084FC' },
  { key: 'fb', label: 'סיבים', unit: 'גר׳', color: '#F472B6', okOver: true },
];

export const PROFILES = {
  nir: { name: 'ניר', goals: { kcal: 1800, p: 150, c: 165, f: 60, fb: 25 }, weekendKcal: 2000 },
  od: { name: 'אוד', fem: true, instructor: true, goals: { kcal: 1400, p: 100, c: 120, f: 55, fb: 20 }, weekendKcal: 1600 },
};

export const goalsFor = (user, weekend) =>
  METRICS.map((m) => ({
    ...m,
    goal: m.key === 'kcal' && weekend ? PROFILES[user].weekendKcal : PROFILES[user].goals[m.key],
  }));

export const CATS = [
  { id: 'protein', label: 'חלבונים' },
  { id: 'carb', label: 'פחמימות וירקות' },
  { id: 'drink', label: 'משקאות' },
  { id: 'sweet', label: 'נשנושים ומתוקים' },
  { id: 'out', label: 'ארוחות בחוץ' },
];

export const MEALS = [
  { id: 'breakfast', label: 'בוקר' },
  { id: 'lunch', label: 'צהריים' },
  { id: 'dinner', label: 'ערב' },
  { id: 'snack', label: 'ביניים' },
];
export const MEAL_TIME = { breakfast: '08:00', lunch: '13:00', dinner: '19:30', snack: '16:00' };

export const DEFAULT_MODEL = 'claude-haiku-5-5';
