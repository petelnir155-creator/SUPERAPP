import { useMemo, useState } from 'react';
import { CATS } from '../lib/config.js';
import { useG } from '../lib/gender.js';
import { Store, useStoreVersion } from '../lib/store.js';
import { catOf, norm, num, r1, r2, uid } from '../lib/utils.js';
import { Field, btnPrimary, chipOn, inputCls } from './ui.jsx';

const EMPTY = { id: null, name: '', cat: 'protein', mode: '100', kcal: '', p: '', c: '', f: '', uname: '', size: '' };
const line = (m, mult) =>
  Math.round(m.kcal * mult) + ' קק״ל · ' + r1(m.p * mult) + ' חלבון · ' + r1(m.c * mult) + ' פחמימות · ' + r1(m.f * mult) + ' שומן';

/* ניהול מאגר המזון. ערכים מוזנים ל-100 גרם או ליחידה שלמה (בקבוק, כוס...) ונשמרים תמיד ל-100 גרם */
export default function FoodsPanel({ user }) {
  const g = useG();
  const ver = useStoreVersion();
  const foods = useMemo(() => Store.list('food', user), [ver, user]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState({ protein: true });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const isUnit = form.mode === 'unit';
  const size = num(form.size);
  const k = isUnit ? (size > 0 ? 100 / size : 0) : 1;
  const p100 = { kcal: r2(num(form.kcal) * k), p: r2(num(form.p) * k), c: r2(num(form.c) * k), f: r2(num(form.f) * k) };
  const canSave = !!form.name.trim() && (!isUnit || size > 0);
  const unitName = form.uname.trim() || (isUnit ? 'יחידה' : 'מנה');
  const hasAny = form.kcal !== '' || form.p !== '' || form.c !== '' || form.f !== '';
  const one = /[הת]$/.test(unitName) || ['כוס', 'כף', 'כפית'].includes(unitName) ? 'אחת' : 'אחד';

  const submit = () => {
    if (!canSave) return;
    const hasUnit = size > 0 && (isUnit || !!form.uname.trim());
    const id = form.id || uid();
    Store.put('food', user, id, {
      id, cat: form.cat, name: form.name.trim(), ...p100, serving: size > 0 ? size : 100, ...(hasUnit ? { uname: unitName } : {}),
    });
    setOpen((o) => ({ ...o, [form.cat]: true }));
    setForm(EMPTY);
    setAdding(false);
  };

  const startEdit = (f) => {
    setForm({
      id: f.id, name: f.name, cat: catOf(f), mode: '100', kcal: String(r2(f.kcal)), p: String(r2(f.p)), c: String(r2(f.c)), f: String(r2(f.f)),
      uname: f.uname || '', size: f.uname || f.serving !== 100 ? String(f.serving) : '',
    });
    setAdding(true);
    setTimeout(() => {
      const el = document.getElementById('food-form');
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' });
    }, 30);
  };

  const numField = (label, key) => (
    <Field label={label}>
      <input className={inputCls} type="number" inputMode="decimal" min="0" placeholder="0" value={form[key]} onChange={set(key)} />
    </Field>
  );
  const modeBtn = (id, label) => (
    <button
      type="button"
      onClick={() => setForm({ ...form, mode: id })}
      aria-pressed={form.mode === id}
      className={'rounded-md py-2.5 px-2 text-sm font-bold border border-line leading-tight ' + (form.mode === id ? chipOn : 'text-ink')}
    >
      {label}
    </button>
  );

  const nq = norm(q);
  const groups = CATS.map((c) => ({ ...c, items: foods.filter((f) => catOf(f) === c.id && (!nq || norm(f.name).includes(nq))) }));
  const shown = nq ? groups.filter((x) => x.items.length) : groups;

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="חיפוש מאכל…"
        aria-label="חיפוש מאכל"
        className="w-full rounded-md px-3 py-2.5 text-base text-ink"
      />
      <button
        onClick={() => {
          if (adding) setForm(EMPTY);
          setAdding(!adding);
        }}
        aria-expanded={adding}
        className="w-full rounded-md py-2.5 font-bold border border-line bg-surf flex items-center justify-center gap-2"
      >
        <span className="text-xl leading-none">{adding ? '−' : '+'}</span> {adding ? 'סגור את הטופס' : 'מאכל חדש'}
      </button>

      {adding && (
        <div id="food-form" className="bg-surf border border-line rounded-lg p-4 space-y-3">
          <h3 className="font-bold">{form.id ? 'עריכת מאכל' : 'מאכל חדש'}</h3>
          <Field label="שם">
            <input className={inputCls} type="text" placeholder="למשל: משקה חלבון" value={form.name} onChange={set('name')} />
          </Field>
          <div>
            <div className="text-xs text-mute font-medium mb-1">קטגוריה</div>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="קטגוריה">
              {CATS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setForm({ ...form, cat: c.id })}
                  aria-pressed={form.cat === c.id}
                  className={'rounded-md py-2 text-sm font-bold border border-line ' + (form.cat === c.id ? chipOn : 'text-ink')}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-mute font-medium mb-1">הערכים התזונתיים שאני מזין הם עבור</div>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="עבור מה הערכים">
              {modeBtn('100', '100 גרם / מ״ל')}
              {modeBtn('unit', 'יחידה שלמה (בקבוק, כוס…)')}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {numField('קלוריות', 'kcal')}
            {numField('חלבון (גר׳)', 'p')}
            {numField('פחמימות (גר׳)', 'c')}
            {numField('שומן (גר׳)', 'f')}
          </div>
          <div className="rounded-md p-3 space-y-2 border border-line">
            <div className="text-sm font-bold">{isUnit ? 'פרטי היחידה' : 'יחידה (לא חובה)'}</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="שם היחידה">
                <input className={inputCls} type="text" placeholder="למשל: בקבוק" value={form.uname} onChange={set('uname')} />
              </Field>
              <Field label={isUnit ? 'כמה גרם / מ״ל ביחידה' : 'גרם / מ״ל ביחידה'}>
                <input className={inputCls} type="number" inputMode="decimal" min="0" placeholder="למשל 330" value={form.size} onChange={set('size')} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['בקבוק', 'כוס', 'קופסה', 'יחידה', 'פרוסה', 'מנה'].map((n) => (
                <button key={n} type="button" onClick={() => setForm({ ...form, uname: n })} className="rounded-full px-3 py-1 text-xs font-bold border border-line">
                  {n}
                </button>
              ))}
            </div>
          </div>
          {hasAny && canSave && (
            <div className="rounded-md p-3 text-sm space-y-1 border border-line" role="status">
              <div className="font-bold">כך זה יישמר</div>
              {size > 0 && (
                <div className="tnum">
                  {unitName} {one} ({r1(size)} גר׳/מ״ל): {line(p100, size / 100)}
                </div>
              )}
              <div className="text-mute tnum">100 גרם / מ״ל: {line(p100, 1)}</div>
            </div>
          )}
          <button onClick={submit} disabled={!canSave} className={'w-full rounded-md py-3 font-bold disabled:opacity-40 ' + btnPrimary}>
            {g('שמור', 'שמרי')} במאגר
          </button>
        </div>
      )}

      <div className="space-y-2">
        {shown.map((c) => {
          const isOpen = nq ? true : !!open[c.id];
          return (
            <div key={c.id} className="bg-surf border border-line rounded-lg overflow-hidden">
              <button
                onClick={() => setOpen((o) => ({ ...o, [c.id]: !o[c.id] }))}
                aria-expanded={isOpen}
                className="w-full px-4 py-3 flex items-center justify-between text-right"
              >
                <span className="font-bold">{c.label}</span>
                <span className="text-sm text-mute">
                  {c.items.length} {isOpen ? '▴' : '▾'}
                </span>
              </button>
              {isOpen && (
                <ul className="border-t border-line divide-y divide-line">
                  {c.items.length === 0 ? (
                    <li className="px-4 py-3 text-sm text-mute">אין עדיין מאכלים בקטגוריה הזו.</li>
                  ) : (
                    c.items.map((f) => (
                      <li key={f.id} className="px-4 py-3 flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold truncate">{f.name}</div>
                          <div className="text-xs text-mute tnum">
                            {f.uname ? (
                              <div>
                                {f.uname} ({f.serving} גר׳): {r1((f.kcal * f.serving) / 100)} קק״ל · {r1((f.p * f.serving) / 100)} חלבון ·{' '}
                                {r1((f.c * f.serving) / 100)} פחמ׳ · {r1((f.f * f.serving) / 100)} שומן
                              </div>
                            ) : null}
                            <div>
                              ל-100 גר׳: {r1(f.kcal)} קק״ל · {r1(f.p)} חלבון · {r1(f.c)} פחמ׳ · {r1(f.f)} שומן
                            </div>
                          </div>
                        </div>
                        <button onClick={() => startEdit(f)} aria-label={'ערוך ' + f.name} className="w-9 h-9 rounded-md text-mute border border-line shrink-0">
                          ✎
                        </button>
                        <button
                          onClick={() => Store.remove('food', user, f.id)}
                          aria-label={'מחק ' + f.name}
                          className="w-9 h-9 rounded-md text-xl leading-none text-mute border border-line shrink-0"
                        >
                          ×
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
