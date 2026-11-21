import { r2 } from './utils.js';

/*
  מתכון = מאכל במאגר עם רכיבים. הערכים ל-100 גרם מחושבים מסך הרכיבים לחלק למשקל המוכן
  (ואם לא הוזן משקל מוכן: לחלק לסך משקל הרכיבים).
  ing: [{ n, g, kcal, p, c, f, fb }]  הערכים לכל רכיב הם לכמות שלו (לא ל-100 גרם)
*/
const KEYS = ['kcal', 'p', 'c', 'f', 'fb'];

export function recipeTotals(rec) {
  const ing = (rec && rec.ing) || [];
  const total = { kcal: 0, p: 0, c: 0, f: 0, fb: 0 };
  let weight = 0;
  ing.forEach((i) => {
    weight += Number(i.g) || 0;
    KEYS.forEach((k) => (total[k] += Number(i[k]) || 0));
  });
  const cooked = Number(rec && rec.cooked) > 0 ? Number(rec.cooked) : 0;
  const basis = cooked || weight; // משקל שלפיו מחושב ה-100 גרם
  const per100 = {};
  KEYS.forEach((k) => (per100[k] = basis > 0 ? r2((total[k] * 100) / basis) : 0));
  const servings = Number(rec && rec.servings) > 0 ? Number(rec.servings) : 0;
  return { total, weight, basis, usesCooked: cooked > 0, per100, servings, servingG: servings ? basis / servings : 0 };
}

/* מסמך מאכל מלא מתוך מתכון, כדי שכל שאר האפליקציה (צ׳אט, היסטוריה, מיון) תעבוד איתו כמו עם כל מאכל */
export function recipeFood(id, cat, name, rec) {
  const t = recipeTotals(rec);
  const hasServ = t.servings > 0;
  return {
    id, cat, name, ...t.per100,
    serving: hasServ ? r2(t.servingG) : 100,
    ...(hasServ ? { uname: 'מנה' } : {}),
    recipe: { ing: rec.ing.map((i) => ({ ...i })), cooked: rec.cooked || null, servings: rec.servings || null },
  };
}
