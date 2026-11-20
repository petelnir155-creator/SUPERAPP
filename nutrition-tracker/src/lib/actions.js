import { Store } from './store.js';
import { stem, words } from './parser.js';
import { gramsOf, macrosOf, mealTime, norm, r2, uid } from './utils.js';

/*
  החלת פעולות על החנות. שומר מפני כפילויות גם אם המודל או המנתח החזירו אותן:
  פריט מאותו סוג מתווסף פעם אחת בלבד, ופעולה עם אותו op לא מתבצעת פעמיים.
*/
export function applyActions(user, actions, o) {
  const log = Store.list('log', user);
  if (o.op && log.some((e) => e.op === o.op)) return { added: [], updated: [], snap: [], dropped: 0, dup: true };

  const byId = Object.fromEntries(log.filter((e) => e.date === o.today).map((e) => [e.id, e]));
  const seenAdd = new Set();
  const seenUpd = new Set();
  const ops = [];
  const added = [];
  const updated = [];
  let dropped = 0;

  // פריט משוער שהוא רק חלק משם של פריט אחר באותה הודעה ("מייפל" לצד "הפוך עם מייפל") הוא כפילות
  const wset = (a) => new Set(words(a.name).map(stem));
  const isPart = (a, all) =>
    a.action !== 'update' && !a.foodId &&
    all.some((b) => b !== a && b.action !== 'update' && wset(a).size > 0 && wset(b).size > wset(a).size && [...wset(a)].every((w) => wset(b).has(w)));
  const list = actions.filter((a) => {
    if (isPart(a, actions)) { dropped++; return false; }
    return true;
  });

  for (const a of list) {
    if (a.action === 'update') {
      const e = byId[a.id];
      if (!e || seenUpd.has(a.id)) { dropped++; continue; }
      seenUpd.add(a.id);
      const old = e.g > 0 ? e.g : e.qty;
      const ng = Math.min(a.grams, 5000);
      if (!(ng > 0) || Math.abs(ng - old) < 0.01) { dropped++; continue; }
      const k = ng / old;
      const serving = e.unit === 'serving' && e.qty > 0 ? old / e.qty : null;
      const d = { ...e, g: ng, qty: serving ? r2(ng / serving) : ng, kcal: e.kcal * k, p: e.p * k, c: e.c * k, f: e.f * k, fb: (e.fb || 0) * k, op: o.op };
      ops.push({ kind: 'log', user, key: e.id, d });
      updated.push({ id: e.id, name: e.name, from: old, to: ng, kcal: d.kcal });
    } else {
      const key = a.foodId ? 'f:' + a.foodId : 'n:' + norm(a.name);
      if (seenAdd.has(key)) { dropped++; continue; }
      seenAdd.add(key);
      const d = {
        id: uid(), date: o.today, time: o.time, meal: o.meal, name: a.name, foodId: a.foodId || null, qty: a.qty, unit: a.unit,
        g: a.g, kcal: a.kcal, p: a.p, c: a.c, f: a.f, fb: a.fb || 0, est: !!a.est, op: o.op,
      };
      ops.push({ kind: 'log', user, key: d.id, d });
      added.push(d);
    }
  }
  const snap = ops.length ? Store.tx(ops) : [];
  return { added, updated, snap, dropped };
}

/* עריכה ידנית של רשומה והוספה ידנית ליום (היסטוריה) */
/* p.macros (אופציונלי): ערכים תזונתיים שנערכו ידנית לרשומה הזו בלבד. המאכל במאגר לא משתנה */
export function editEntry(user, e, p) {
  const r = e.qty > 0 ? p.qty / e.qty : 1;
  Store.put('log', user, e.id, {
    ...e, qty: p.qty, g: (e.g || e.qty) * r, meal: p.meal, time: p.time, date: p.date || e.date,
    ...(p.macros || { kcal: e.kcal * r, p: e.p * r, c: e.c * r, f: e.f * r, fb: (e.fb || 0) * r }),
  });
}

export function addEntryManual(user, date, food, qty, unit, meal) {
  const g = gramsOf(food, qty, unit);
  const id = uid();
  Store.put('log', user, id, {
    id, date, time: mealTime(date, meal), meal, name: food.name, foodId: food.id, qty, unit, g, est: false, ...macrosOf(food, g),
  });
}

/* נתוני יום: מים (כוסות), צעדים, מצב סופ״ש */
export function patchDay(user, date, patch) {
  const cur = Store.get('day', user, date) || { date, water: 0, steps: 0, wk: false };
  Store.put('day', user, date, { ...cur, ...patch });
}
