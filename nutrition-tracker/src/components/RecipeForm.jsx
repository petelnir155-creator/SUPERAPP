import { useState } from 'react';
import { CATS } from '../lib/config.js';
import { useG } from '../lib/gender.js';
import { recipeFood, recipeTotals } from '../lib/recipe.js';
import { FOOD_USER, Store } from '../lib/store.js';
import { macrosOf, num, r1, r2, uid } from '../lib/utils.js';
import { Field, btnPrimary, chipOn, inputCls } from './ui.jsx';

const KEYS = [['kcal', 'קק״ל'], ['p', 'חלבון'], ['c', 'פחמ׳'], ['f', 'שומן'], ['fb', 'סיבים']];
const blank = () => ({ key: uid(), n: '', g: '', kcal: '', p: '', c: '', f: '', fb: '' });
const fromIng = (i) => ({ key: uid(), n: i.n, g: String(i.g), ...Object.fromEntries(KEYS.map(([k]) => [k, String(r2(i[k] || 0))])) });

/*
  טופס מתכון / מנה מורכבת. הערכים לכל רכיב הם לכמות שלו. שינוי כמות רכיב (גרם) מעדכן את הערכים שלו יחסית.
  הערכים ל-100 גרם מחושבים מחדש בכל שינוי: סך הרכיבים חלקי המשקל המוכן (או סך משקל הרכיבים אם לא הוזן).
  שמירה מעדכנת רק את המאכל במאגר. רשומות שכבר נוספו ליומן נשארות כפי שהן.
*/
export default function RecipeForm({ init, foods, onDone }) {
  const g = useG();
  const rec = init && init.recipe;
  const [name, setName] = useState(init ? init.name : '');
  const [cat, setCat] = useState(init ? init.cat : 'protein');
  const [rows, setRows] = useState(rec ? rec.ing.map(fromIng) : [blank()]);
  const [cooked, setCooked] = useState(rec && rec.cooked ? String(rec.cooked) : '');
  const [servings, setServings] = useState(rec && rec.servings ? String(rec.servings) : '');
  const [pick, setPick] = useState('');

  const ing = rows.map((r) => ({ n: r.n.trim(), g: num(r.g), ...Object.fromEntries(KEYS.map(([k]) => [k, num(r[k])])) }));
  const t = recipeTotals({ ing, cooked: num(cooked), servings: num(servings) });
  const canSave = !!name.trim() && rows.some((r) => r.n.trim()) && t.basis > 0;

  const upd = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setGrams = (r, v) => {
    const prev = num(r.g);
    const nv = num(v);
    // כמות חדשה: הערכים התזונתיים של הרכיב משתנים באותו יחס
    if (prev > 0 && nv > 0 && v !== '') {
      upd(r.key, { g: v, ...Object.fromEntries(KEYS.map(([k]) => [k, String(r2((num(r[k]) * nv) / prev))])) });
    } else upd(r.key, { g: v });
  };
  const addFromDb = (id) => {
    const f = foods.find((x) => x.id === id);
    if (!f) return;
    const gr = f.uname && f.serving ? f.serving : 100;
    const m = macrosOf(f, gr);
    setRows((rs) => [...rs.filter((r) => r.n.trim() || r.g !== ''), { key: uid(), n: f.name, g: String(gr), ...Object.fromEntries(KEYS.map(([k]) => [k, String(r2(m[k] || 0))])) }]);
    setPick('');
  };

  const save = () => {
    if (!canSave) return;
    const id = init ? init.id : uid();
    const doc = recipeFood(id, cat, name.trim(), { ing: ing.filter((i) => i.n), cooked: num(cooked) || null, servings: num(servings) || null });
    Store.put('food', FOOD_USER, id, doc);
    onDone(cat);
  };

  const num2 = (label, val, set, ph) => (
    <Field label={label}>
      <input className={inputCls} type="number" inputMode="decimal" min="0" placeholder={ph || '0'} value={val} onChange={(e) => set(e.target.value)} />
    </Field>
  );

  return (
    <div id="food-form" className="bg-surf border border-line rounded-lg p-4 space-y-3">
      <h3 className="font-bold">{init ? 'עריכת מתכון' : 'מתכון חדש'}</h3>
      <Field label="שם המתכון">
        <input className={inputCls} type="text" placeholder="למשל: פנקייק קוטג׳" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="קטגוריה">
        {CATS.map((c) => (
          <button key={c.id} type="button" onClick={() => setCat(c.id)} aria-pressed={cat === c.id} className={'rounded-md py-1.5 text-xs font-bold border border-line ' + (cat === c.id ? chipOn : 'text-ink')}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="text-sm font-bold">רכיבים (הערכים לכל רכיב הם לכמות שלו)</div>
      <ul className="space-y-2">
        {rows.map((r, idx) => (
          <li key={r.key} className="rounded-md border border-line p-2.5 space-y-2">
            <div className="flex items-end gap-2">
              <div className="flex-1 min-w-0">
                <Field label={'רכיב ' + (idx + 1)}>
                  <input className={inputCls} type="text" placeholder="למשל: קמח לבן" value={r.n} onChange={(e) => upd(r.key, { n: e.target.value })} />
                </Field>
              </div>
              <div className="w-24">
                <Field label="כמות (גר׳)">
                  <input className={inputCls} type="number" inputMode="decimal" min="0" placeholder="0" value={r.g} onChange={(e) => setGrams(r, e.target.value)} />
                </Field>
              </div>
              <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={'הסר רכיב ' + (r.n || idx + 1)} className="w-10 h-10 rounded-md text-xl leading-none text-mute border border-line shrink-0">
                ×
              </button>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {KEYS.map(([k, label]) => (
                <Field key={k} label={label}>
                  <input className={inputCls + ' px-1.5 text-center'} type="number" inputMode="decimal" min="0" aria-label={label + ' (' + (r.n || 'רכיב ' + (idx + 1)) + ')'} placeholder="0" value={r[k]} onChange={(e) => upd(r.key, { [k]: e.target.value })} />
                </Field>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button type="button" onClick={() => setRows((rs) => [...rs, blank()])} className="flex-1 rounded-md py-2 text-sm font-bold border border-line">
          + רכיב ידני
        </button>
        <select className={inputCls + ' flex-1'} value={pick} onChange={(e) => addFromDb(e.target.value)} aria-label="הוסף רכיב מהמאגר">
          <option value="">+ מהמאגר…</option>
          {foods.filter((f) => !f.recipe).map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {num2('משקל מוכן סופי (גר׳, לא חובה)', cooked, setCooked, t.weight ? String(Math.round(t.weight)) : '0')}
        {num2('מספר מנות (לא חובה)', servings, setServings, '1')}
      </div>

      <div className="rounded-md p-3 text-sm space-y-1 border border-line" role="status" aria-label="סיכום המתכון">
        <div className="font-bold">סיכום</div>
        <div className="tnum">
          סה״כ ({r1(t.weight)} גר׳ רכיבים): {Math.round(t.total.kcal)} קק״ל · {r1(t.total.p)} חלבון · {r1(t.total.c)} פחמ׳ · {r1(t.total.f)} שומן · {r1(t.total.fb)} סיבים
        </div>
        <div className="tnum">
          {t.basis > 0 ? (
            <>
              ל-100 גר׳ {t.usesCooked ? 'מוכן' : 'לפי משקל הרכיבים'}: <b>{Math.round(t.per100.kcal)} קק״ל · {r1(t.per100.p)} חלבון · {r1(t.per100.c)} פחמ׳ · {r1(t.per100.f)} שומן · {r1(t.per100.fb)} סיבים</b>
            </>
          ) : (
            <span className="text-mute">הזן כמות לרכיבים או משקל מוכן כדי לחשב ל-100 גרם</span>
          )}
        </div>
        {t.servings > 0 && t.basis > 0 && (
          <div className="text-mute tnum">
            מנה אחת ({r1(t.servingG)} גר׳): {Math.round((t.total.kcal / t.servings))} קק״ל · {r1(t.total.p / t.servings)} חלבון · {r1(t.total.c / t.servings)} פחמ׳ · {r1(t.total.f / t.servings)} שומן · {r1(t.total.fb / t.servings)} סיבים
          </div>
        )}
      </div>
      <p className="text-[11px] text-mute">שמירה מעדכנת את המתכון במאגר בלבד. רשומות שכבר נוספו ליומן לא משתנות.</p>
      <div className="flex gap-3">
        <button type="button" onClick={() => onDone(null)} className="flex-1 rounded-md py-3 font-bold border border-line">
          ביטול
        </button>
        <button onClick={save} disabled={!canSave} className={'flex-1 rounded-md py-3 font-bold disabled:opacity-40 ' + btnPrimary}>
          {g('שמור', 'שמרי')} מתכון
        </button>
      </div>
    </div>
  );
}
