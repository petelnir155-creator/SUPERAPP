import { useMemo, useState } from 'react';
import { useG } from '../lib/gender.js';
import { Store, useStoreVersion } from '../lib/store.js';
import { EX_CATS, addExercise, exercisesOf } from '../lib/workouts.js';
import { Field, btnPrimary, chipOn, inputCls } from './ui.jsx';

/* מאגר התרגילים: הוספה ידנית, שיוך לקטגוריה, עריכה ומחיקה */
export default function ExercisesPanel({ user }) {
  const g = useG();
  const ver = useStoreVersion();
  const list = useMemo(() => exercisesOf(user), [ver, user]); // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setForm] = useState({ id: null, name: '', cat: 'chest' });
  const [open, setOpen] = useState({ chest: true });
  const canSave = !!form.name.trim();

  const submit = () => {
    if (!canSave) return;
    addExercise(user, form);
    setOpen((o) => ({ ...o, [form.cat]: true }));
    setForm({ id: null, name: '', cat: form.cat });
  };

  return (
    <div className="space-y-4">
      <div className="border border-line bg-surf rounded-lg p-3 space-y-3">
        <div className="text-sm font-bold">{form.id ? 'עריכת תרגיל' : 'תרגיל חדש'}</div>
        <Field label="שם התרגיל">
          <input
            className={inputCls}
            type="text"
            maxLength="60"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </Field>
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="קטגוריה">
          {EX_CATS.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={form.cat === c.id}
              onClick={() => setForm({ ...form, cat: c.id })}
              className={'rounded-md py-2 text-sm font-bold border border-line ' + (form.cat === c.id ? chipOn : 'text-ink')}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {form.id ? (
            <button onClick={() => setForm({ id: null, name: '', cat: form.cat })} className="flex-1 rounded-md py-2.5 font-bold border border-line">
              ביטול
            </button>
          ) : null}
          <button onClick={submit} disabled={!canSave} className={'flex-1 rounded-md py-2.5 font-bold disabled:opacity-40 ' + btnPrimary}>
            {form.id ? g('שמור', 'שמרי') : g('הוסף', 'הוסיפי')}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {EX_CATS.map((c) => {
          const items = list.filter((e) => e.cat === c.id);
          const isOpen = !!open[c.id];
          return (
            <div key={c.id} className="border border-line rounded-lg bg-surf overflow-hidden">
              <button className="w-full flex justify-between items-center px-3 py-3 font-bold text-sm" aria-expanded={isOpen} onClick={() => setOpen({ ...open, [c.id]: !isOpen })}>
                <span>{c.label}</span>
                <span className="text-mute font-medium tnum">
                  {items.length} {isOpen ? '▴' : '▾'}
                </span>
              </button>
              {isOpen ? (
                <ul className="border-t border-line divide-y divide-line">
                  {items.length ? (
                    items.map((e) => (
                      <li key={e.id} className="flex items-center gap-2 px-3 py-2">
                        <span className="flex-1 min-w-0 truncate text-sm">{e.name}</span>
                        <button onClick={() => setForm({ id: e.id, name: e.name, cat: e.cat })} aria-label={'ערוך ' + e.name} className="w-8 h-8 rounded-md text-mute border border-line">
                          ✎
                        </button>
                        <button onClick={() => Store.remove('ex', user, e.id)} aria-label={'מחק ' + e.name} className="w-8 h-8 rounded-md text-lg leading-none text-mute border border-line">
                          ×
                        </button>
                      </li>
                    ))
                  ) : (
                    <li className="px-3 py-2 text-sm text-mute">אין תרגילים בקטגוריה</li>
                  )}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
