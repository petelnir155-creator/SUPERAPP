import { useMemo, useState } from 'react';
import { useG } from '../lib/gender.js';
import { Store, useStoreVersion } from '../lib/store.js';
import { addShift, fmtHours, fmtMoney, lastRate, monthShiftSummary, removeShift, shiftAmount, shiftsOf } from '../lib/workouts.js';
import { fmtDay, num, todayKey } from '../lib/utils.js';
import { Field, btnPrimary, inputCls } from './ui.jsx';

/* עבודה (אוד): הזנת משמרות פילאטיס, סיכום חודשי ורשימה */
export default function WorkShifts({ user, today }) {
  const g = useG();
  const ver = useStoreVersion();
  const [date, setDate] = useState(today);
  const [hours, setHours] = useState('');
  const [rate, setRate] = useState('');
  const [note, setNote] = useState('');
  const [more, setMore] = useState(false);
  const shifts = useMemo(() => [...shiftsOf(user)].sort((a, b) => b.date.localeCompare(a.date) || (b.id > a.id ? 1 : -1)), [ver, user]); // eslint-disable-line react-hooks/exhaustive-deps
  const sum = useMemo(() => monthShiftSummary(user, today.slice(0, 7)), [ver, user, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const defRate = useMemo(() => lastRate(user), [ver, user]); // eslint-disable-line react-hooks/exhaustive-deps
  const h = num(hours);
  const r = rate === '' ? defRate : num(rate);
  const ok = !!date && h > 0 && h <= 24;

  const submit = () => {
    if (!ok) return;
    addShift(user, { date, hours: h, rate: r, note });
    setHours('');
    setNote('');
  };
  const shown = more ? shifts : shifts.slice(0, 30);

  return (
    <div className="p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2" aria-label="סיכום החודש">
        <div className="rounded-md border border-line bg-surf2 px-3 py-2.5 text-center">
          <div className="text-[11px] text-mute">סה״כ שעות החודש</div>
          <div className="text-xl font-extrabold tnum">{fmtHours(sum.minutes)}</div>
        </div>
        <div className="rounded-md border border-line bg-surf2 px-3 py-2.5 text-center">
          <div className="text-[11px] text-mute">סה״כ סכום לחודש</div>
          <div className="text-xl font-extrabold tnum">{fmtMoney(sum.amount)}</div>
        </div>
      </div>

      <div className="rounded-md border border-line p-3 space-y-2">
        <div className="font-bold text-sm">משמרת חדשה</div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="תאריך">
            <input className={inputCls} type="date" max={todayKey()} value={date} onChange={(e) => setDate(e.target.value)} aria-label="תאריך המשמרת" />
          </Field>
          <Field label="שעות עבודה">
            <input className={inputCls} type="number" inputMode="decimal" min="0" max="24" step="0.25" placeholder="למשל 4" value={hours} onChange={(e) => setHours(e.target.value)} aria-label="שעות עבודה" />
          </Field>
        </div>
        <Field label="תעריף לשעה (ש״ח)">
          <input className={inputCls} type="number" inputMode="decimal" min="0" step="1" placeholder={defRate ? String(defRate) : 'למשל 120'} value={rate} onChange={(e) => setRate(e.target.value)} aria-label="תעריף לשעה" />
        </Field>
        <Field label="הערה (לא חובה)">
          <input className={inputCls} type="text" maxLength="120" value={note} onChange={(e) => setNote(e.target.value)} aria-label="הערה למשמרת" onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </Field>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-mute tnum">{ok && r > 0 ? 'סכום המשמרת: ' + fmtMoney(h * r) : ''}</span>
          <button onClick={submit} disabled={!ok} className={'rounded-md px-5 py-2.5 font-bold disabled:opacity-40 ' + btnPrimary}>
            {g('הוסף', 'הוסיפי')} משמרת
          </button>
        </div>
      </div>

      {shifts.length ? (
        <ul className="space-y-1.5">
          {shown.map((s) => (
            <li key={s.id} className="border border-line rounded-md px-3 py-2.5 bg-surf2 flex items-center gap-2.5">
              <div className="flex-1 min-w-0">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="font-bold">{fmtDay(s.date)}</span>
                  <span className="tnum shrink-0">{fmtHours(s.minutes)} שעות</span>
                </div>
                <div className="flex justify-between gap-3 text-xs text-mute tnum">
                  <span>{s.rate > 0 ? fmtMoney(s.rate) + ' לשעה' : 'בלי תעריף'}</span>
                  <span>{s.rate > 0 ? fmtMoney(shiftAmount(s)) : ''}</span>
                </div>
                {s.note ? <div className="text-xs mt-1 break-words">{s.note}</div> : null}
              </div>
              <button onClick={() => Store.remove('shift', user, s.id)} aria-label={'מחק משמרת ' + fmtDay(s.date)} className="w-9 h-9 rounded-md text-xl leading-none text-mute border border-line shrink-0">
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-mute px-1">עוד לא הוזנו משמרות.</p>
      )}
      {shifts.length > 30 && !more ? (
        <button onClick={() => setMore(true)} className="w-full rounded-md border border-line py-2 text-sm font-bold">
          הצג עוד ({shifts.length - 30})
        </button>
      ) : null}
    </div>
  );
}
