import { useMemo, useState } from 'react';
import { WAIST_GOAL } from '../lib/config.js';
import { useG } from '../lib/gender.js';
import { Store, useStoreVersion } from '../lib/store.js';
import { fmtDay, num, r1, todayKey } from '../lib/utils.js';
import { Field, Track, btnPrimary, chipOn, inputCls } from './ui.jsx';

function Measure({ title, unit, field, goal, data, onSave, onDelete, placeholder, intro }) {
  const g = useG();
  const [val, setVal] = useState('');
  const sorted = useMemo(() => [...data].sort((a, b) => a.date.localeCompare(b.date)), [data]);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const hasGoal = typeof goal === 'number';
  const add = () => {
    const v = num(val);
    if (v <= 0) return;
    onSave(todayKey(), v);
    setVal('');
  };
  const start = first ? first[field] : 0;
  const now = last ? last[field] : 0;
  const pct = !first || !hasGoal ? 0 : start - goal <= 0 ? 100 : Math.max(0, Math.min(100, ((start - now) / (start - goal)) * 100));
  const change = first ? r1(now - start) : 0;

  const W = 300;
  const H = 130;
  const P = 16;
  const vals = sorted.map((x) => x[field]);
  const pts = hasGoal ? vals.concat([goal]) : vals;
  const lo = Math.min(...pts, 1e9) - 2;
  const hi = Math.max(...pts, -1e9) + 2;
  const X = (i) => (sorted.length === 1 ? W / 2 : P + (i * (W - 2 * P)) / (sorted.length - 1));
  const Y = (v) => P + ((hi - v) / (hi - lo)) * (H - 2 * P);
  const fmt = (k) => fmtDay(k, { day: 'numeric', month: 'numeric' });

  return (
    <div className="space-y-4">
      <div className="bg-surf border border-line rounded-lg p-4 space-y-3">
        <h2 className="font-bold text-lg">{title}</h2>
        <p className="text-sm text-mute">{intro}</p>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <Field label={unit}>
              <input className={inputCls} type="number" inputMode="decimal" min="0" step="0.1" placeholder={placeholder} value={val} onChange={(e) => setVal(e.target.value)} />
            </Field>
          </div>
          <button onClick={add} disabled={num(val) <= 0} className={'rounded-md px-5 py-2.5 font-bold disabled:opacity-40 ' + btnPrimary}>
            {g('שמור', 'שמרי')}
          </button>
        </div>
      </div>

      {first ? (
        <div className="bg-surf border border-line rounded-lg p-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="font-bold">
              עכשיו <b className="text-2xl font-extrabold tnum">{now}</b> {unit}
            </span>
            <span className="text-sm text-mute tnum">
              {hasGoal
                ? now > goal ? 'נותרו ' + r1(now - goal) + ' ' + unit + ' ליעד' : 'הגעת ליעד ✓'
                : sorted.length > 1 ? 'מההתחלה: ' + (change > 0 ? '+' : '') + change + ' ' + unit : 'מדידה ראשונה'}
            </span>
          </div>
          {hasGoal && (
            <>
              <Track label="התקדמות ליעד" now={pct} max={100} segs={[{ from: 0, w: pct, color: 'var(--color-brand)' }]} />
              <p className="text-xs text-mute">
                התחלה {start} {unit} · יעד {goal} {unit}
              </p>
            </>
          )}
          <svg viewBox={'0 0 ' + W + ' ' + H} className="w-full" role="img" aria-label={'גרף ' + title}>
            {hasGoal && (
              <>
                <line x1={P} x2={W - P} y1={Y(goal)} y2={Y(goal)} stroke="var(--color-mute)" strokeDasharray="4 4" />
                <text x={W - P} y={Y(goal) - 4} fontSize="10" fill="var(--color-mute)" textAnchor="end">
                  יעד {goal}
                </text>
              </>
            )}
            <polyline fill="none" stroke="var(--color-brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={sorted.map((p, i) => X(i) + ',' + Y(p[field])).join(' ')} />
            {sorted.map((p, i) => (
              <circle key={p.date} cx={X(i)} cy={Y(p[field])} r="3.5" fill="var(--color-brand)" />
            ))}
          </svg>
        </div>
      ) : (
        <p className="text-sm text-mute px-1">עוד אין מדידות.</p>
      )}

      {sorted.length > 0 && (
        <ul className="space-y-1.5">
          {[...sorted].reverse().map((p, i, arr) => {
            const prev = arr[i + 1];
            const d = prev ? r1(p[field] - prev[field]) : null;
            return (
              <li key={p.date} className="bg-surf border border-line rounded-md px-4 py-2.5 flex items-center gap-3 text-sm">
                <span className="font-bold flex-1">{fmt(p.date)}</span>
                <span className="tnum">
                  {p[field]} {unit}
                </span>
                <span className="w-14 text-mute tnum">{d === null ? '' : (d > 0 ? '+' : '') + d}</span>
                <button onClick={() => onDelete(p.date)} aria-label={'מחק מדידה ' + fmt(p.date)} className="w-9 h-9 rounded-md text-xl leading-none text-mute border border-line">
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function Metrics({ user }) {
  const ver = useStoreVersion();
  const [sub, setSub] = useState('weight');
  const weight = useMemo(() => Store.list('weight', user), [ver, user]);
  const waist = useMemo(() => Store.list('waist', user), [ver, user]);
  return (
    <section className="px-4 space-y-4">
      <div className="grid grid-cols-2 rounded-md border border-line bg-surf p-1" role="tablist" aria-label="סוג מדד">
        {[['weight', 'משקל'], ['waist', 'היקפים']].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={sub === id} onClick={() => setSub(id)} className={'rounded py-2 font-bold text-sm ' + (sub === id ? chipOn : 'text-ink')}>
            {label}
          </button>
        ))}
      </div>
      {sub === 'weight' ? (
        <Measure
          key="weight" title="משקל" unit="ק״ג" field="kg" data={weight} placeholder="למשל 82.4" intro="מדידה נוספת באותו יום מחליפה את הקודמת."
          onSave={(date, v) => Store.put('weight', user, date, { date, kg: v })} onDelete={(date) => Store.remove('weight', user, date)}
        />
      ) : (
        <Measure
          key="waist" title="היקף מותניים (פופיק)" unit="ס״מ" field="cm" goal={WAIST_GOAL} data={waist} placeholder="למשל 108.5"
          intro="מדידה פעם בשבוע. מדידה נוספת באותו יום מחליפה את הקודמת."
          onSave={(date, v) => Store.put('waist', user, date, { date, cm: v })} onDelete={(date) => Store.remove('waist', user, date)}
        />
      )}
    </section>
  );
}
