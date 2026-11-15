import { useEffect, useState } from 'react';
import { MEALS } from '../lib/config.js';
import { useG } from '../lib/gender.js';
import { fmtN, nowTime, num, r1, r2, todayKey } from '../lib/utils.js';

export const inputCls = 'mt-1 w-full rounded-md px-3 py-2.5 text-base text-ink';
export const btnPrimary = 'bg-brand text-onbrand';
export const chipOn = 'bg-brand text-onbrand border-brand';

export function Field({ label, children }) {
  return (
    <label className="block text-xs text-mute font-medium">
      {label}
      {children}
    </label>
  );
}

export function Switch({ on, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={'relative shrink-0 rounded-full border border-line ' + (on ? 'bg-brand' : 'bg-surf2')}
      style={{ width: 38, height: 22 }}
    >
      <span
        className={'absolute rounded-full ' + (on ? 'bg-onbrand' : 'bg-mute')}
        style={{ top: 2, width: 16, height: 16, insetInlineStart: on ? 18 : 2, transition: 'inset-inline-start .15s' }}
      />
    </button>
  );
}

export const IconGear = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const IconSend = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" transform="rotate(180 12 12)" />
  </svg>
);

/* מסילת התקדמות: שכבות לפי אחוזים, מתחילות מצד ההתחלה (ימין ב-RTL) */
export function Track({ segs, ticks, divs, label, now, max }) {
  return (
    <div
      className="relative h-[7px] rounded-sm overflow-hidden bg-surf2"
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(now)}
      aria-valuemin="0"
      aria-valuemax={max}
    >
      {segs.map((s, i) => (
        <div key={i} className="fill absolute top-0 bottom-0" style={{ insetInlineStart: s.from + '%', width: Math.max(0, s.w) + '%', background: s.color }} />
      ))}
      {divs ? (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `repeating-linear-gradient(to left, transparent 0, transparent calc(${100 / divs}% - 1.5px), var(--color-surf) calc(${100 / divs}% - 1.5px), var(--color-surf) ${100 / divs}%)`,
          }}
        />
      ) : null}
      {(ticks || []).map((t, i) => (
        <div key={'t' + i} className="absolute top-0 bottom-0 bg-bg" style={{ insetInlineStart: t + '%', width: 2 }} />
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/65" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md mx-auto bg-bg border border-line rounded-t-xl flex flex-col"
        style={{ height: '92dvh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
          <h2 className="font-bold text-lg">{title}</h2>
          <button autoFocus onClick={onClose} aria-label="סגור" className="w-9 h-9 rounded-md border border-line text-xl leading-none">
            ×
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function MealChips({ value, onChange }) {
  return (
    <div className="grid grid-cols-4 gap-2" role="group" aria-label="ארוחה">
      {MEALS.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          aria-pressed={value === m.id}
          className={'rounded-md py-2 text-sm font-bold border border-line ' + (value === m.id ? chipOn : 'text-ink')}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

export function EditSheet({ entry, onSave, onClose }) {
  const g = useG();
  const [qty, setQty] = useState(String(r2(entry.qty)));
  const [meal, setMeal] = useState(entry.meal || 'snack');
  const [time, setTime] = useState(entry.time || nowTime());
  const [date, setDate] = useState(entry.date || todayKey());
  const q = num(qty);
  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/60" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md mx-auto bg-surf border border-line rounded-t-xl p-4 space-y-3"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-bold text-lg">עריכת {entry.name}</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label={'כמות (' + (entry.unit === 'serving' ? 'מנות' : 'גרם') + ')'}>
            <input className={inputCls} type="number" inputMode="decimal" min="0" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="שעה">
            <input className={inputCls} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <Field label="תאריך">
          <input className={inputCls} type="date" max={todayKey()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <MealChips value={meal} onChange={setMeal} />
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 rounded-md py-3 font-bold border border-line">
            ביטול
          </button>
          <button
            onClick={() => q > 0 && onSave({ qty: q, meal, time, date: date || entry.date })}
            disabled={q <= 0}
            className={'flex-1 rounded-md py-3 font-bold disabled:opacity-40 ' + btnPrimary}
          >
            {g('שמור', 'שמרי')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MealList({ entries, onDelete, onEdit }) {
  return (
    <div className="space-y-4">
      {MEALS.map((m) => {
        const items = entries.filter((e) => (e.meal || 'snack') === m.id).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        if (!items.length) return null;
        return (
          <div key={m.id}>
            <div className="flex justify-between px-1 mb-1.5 text-sm">
              <b>{m.label}</b>
              <span className="text-mute tnum">{fmtN(items.reduce((s, e) => s + e.kcal, 0))} קק״ל</span>
            </div>
            <ul className="space-y-1.5">
              {items.map((e) => (
                <li key={e.id} className="border border-line rounded-md px-3 py-2.5 flex items-center gap-2.5 bg-surf2">
                  <span className="text-xs text-mute w-10 shrink-0 tnum">{e.time || ''}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">
                      {e.name}
                      {e.est ? <span className="text-xs font-medium text-warn"> הערכה</span> : null}
                    </div>
                    <div className="text-xs text-mute tnum">
                      {r1(e.qty)} {e.unit === 'serving' ? 'מנות' : 'גרם'} · {r1(e.p)} חלבון · {r1(e.c)} פחמ׳ · {r1(e.f)} שומן · {r1(e.fb || 0)} סיבים
                    </div>
                  </div>
                  <div className="text-sm font-extrabold tnum">{fmtN(e.kcal)}</div>
                  <button onClick={() => onEdit(e.id)} aria-label={'ערוך ' + e.name} className="w-9 h-9 rounded-md text-mute border border-line">
                    ✎
                  </button>
                  <button onClick={() => onDelete(e.id)} aria-label={'מחק ' + e.name} className="w-9 h-9 rounded-md text-xl leading-none text-mute border border-line">
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
