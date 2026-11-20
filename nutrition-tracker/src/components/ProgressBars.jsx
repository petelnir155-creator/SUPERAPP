import { useEffect, useRef, useState } from 'react';
import { CUP_GOAL, FLOOR_BONUS, FLOOR_GOAL, FLOOR_SLIDER_MAX, CUP_ML, OVER, PROFILES, STEP_BONUS, STEP_GOAL, STEP_SLIDER_MAX, goalsFor } from '../lib/config.js';
import { patchDay } from '../lib/actions.js';
import { fmtN, num } from '../lib/utils.js';
import { Switch, Track } from './ui.jsx';

function BarHead({ label, children }) {
  return (
    <div className="flex items-baseline justify-between mb-1 text-[13px]">
      <span className="font-bold">{label}</span>
      <span className="tnum text-mute">{children}</span>
    </div>
  );
}

function NutrientBar({ g, value, entries }) {
  const [open, setOpen] = useState(false);
  const over = value > g.goal;
  const bad = over && !g.okOver; // חלבון מעל היעד נשאר ירוק, השאר אדום
  const pct = Math.round((value / g.goal) * 100);
  const color = bad ? OVER : g.color;
  const strong = { color: bad ? OVER : 'var(--color-ink)' };
  const rows = (entries || [])
    .map((e) => ({ e, v: num(e[g.key]) }))
    .filter((r) => r.v > 0)
    .sort((a, b) => b.v - a.v);
  const sum = rows.reduce((s, r) => s + r.v, 0);
  const id = 'bd-' + g.key;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        aria-label={'פירוט ' + g.label}
        className="block w-full text-start"
      >
        <BarHead label={g.label}>
          <b className="text-[15px]" style={strong}>{fmtN(value)}</b>
          {' / ' + fmtN(g.goal) + ' ' + g.unit + ' · '}
          <span style={strong}>{pct}%</span>
          <span className="ms-1.5 text-[10px]" aria-hidden="true">{open ? '▲' : '▼'}</span>
        </BarHead>
        <Track label={g.label} now={value} max={g.goal} segs={[{ from: 0, w: Math.min(100, pct), color }]} />
      </button>
      {open && (
        <div id={id} className="mt-2 rounded-md border border-line px-3 py-2 text-[12px]">
          {rows.length === 0 ? (
            <div className="text-mute">עוד לא נרשם כלום להיום</div>
          ) : (
            <>
              <ul className="divide-y divide-line">
                {rows.map(({ e, v }) => (
                  <li key={e.id} className="flex items-baseline justify-between gap-3 py-1">
                    <span className="min-w-0 truncate">
                      {e.name}
                      {e.g ? <span className="text-mute tnum"> · {fmtN(e.g)} גר׳</span> : null}
                    </span>
                    <b className="tnum shrink-0">{(Math.round(v * 10) / 10).toLocaleString('he-IL')} {g.unit}</b>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between border-t border-line mt-1 pt-1.5 font-bold tnum">
                <span>סה״כ</span>
                <span>{(Math.round(sum * 10) / 10).toLocaleString('he-IL')} {g.unit}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/*
  סליידר-פס משותף לצעדים ולקומות: הפס והסליידר הם אותו רכיב (הסליידר שקוף מעל הפס).
  עד היעד צבע אחד, מהיעד ומעלה צבע בונוס. כל הזזה נשמרת מיד, בלי כפתור שמירה.
*/
function SliderStat({ label, value, onSet, goal, bonus, max, step, fmt = fmtN }) {
  const [draft, setDraft] = useState(null); // ערך תוך כדי גרירה, כדי שהפס יזוז בזמן אמת
  const timer = useRef(null);
  const pending = useRef(null);

  const flush = () => {
    clearTimeout(timer.current);
    if (pending.current !== null) {
      onSet(pending.current);
      pending.current = null;
      setDraft(null); // מכאן הערך נקרא מהחנות
    }
  };
  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps

  const drag = (v) => {
    setDraft(v);
    pending.current = v;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 200); // כתיבה לחנות בזמן אמת, בלי להציף בכל פיקסל
  };

  const v = draft !== null ? draft : value;
  const base = (Math.min(v, goal) / max) * 100;
  const extra = (Math.max(0, Math.min(v, max) - goal) / max) * 100;
  const pct = Math.round((v / goal) * 100);
  const full = v >= bonus;
  const accent = full ? 'var(--color-gold)' : v >= goal ? 'var(--color-good)' : 'var(--color-ink)';
  return (
    <div>
      <BarHead label={label}>
        <b className="text-[15px]" style={{ color: accent }}>{fmt(v)}</b>
        {' / ' + fmt(goal) + ' · '}
        <span style={{ color: accent }}>{pct}%</span>
        {full ? <span style={{ color: accent }}> ✓ בונוס</span> : null}
      </BarHead>
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
          <Track
            label={label}
            now={v}
            max={max}
            ticks={[(goal / max) * 100, (bonus / max) * 100]}
            segs={[{ from: 0, w: base, color: '#2DD4BF' }, { from: base, w: extra, color: '#FACC15' }]}
          />
        </div>
        <input
          type="range"
          min="0"
          max={max}
          step={step}
          value={Math.min(v, max)}
          aria-label={label}
          onChange={(e) => drag(Number(e.target.value))}
          onPointerUp={flush}
          onPointerCancel={flush}
          onKeyUp={flush}
          onBlur={flush}
          className="ov-range absolute inset-0 w-full h-full"
        />
      </div>
    </div>
  );
}

/* מים: כוס אחת = 350 מ״ל */
function WaterBar({ cups, onSet }) {
  const [txt, setTxt] = useState(null);
  const ml = Math.round(cups * CUP_ML);
  /* הקלדת מ״ל חופשית (לא תמיד כוס של 350). נשמר ככוסות עשרוניות, ולכן שאר האפליקציה לא משתנה */
  const commitTxt = () => {
    if (txt !== null) {
      if (String(txt).trim() !== '') onSet(Math.max(0, num(txt)) / CUP_ML);
      setTxt(null);
    }
  };
  const goal = CUP_GOAL * CUP_ML;
  const pct = Math.round((ml / goal) * 100);
  const btn = 'rounded-md border border-line px-2.5 py-1 font-bold text-ink';
  return (
    <div>
      <BarHead label="מים">
        <b className="text-[15px]" style={{ color: pct >= 100 ? 'var(--color-good)' : 'var(--color-ink)' }}>{fmtN(ml)}</b>
        {' / ' + fmtN(goal) + ' מ״ל · ' + pct + '%'}
      </BarHead>
      <Track label="מים" now={ml} max={goal} divs={CUP_GOAL} segs={[{ from: 0, w: Math.min(100, pct), color: '#22D3EE' }]} />
      <div className="flex items-center justify-between mt-1.5 text-[11px] text-mute tnum">
        <span>{Math.round(cups * 10) / 10} כוסות · {CUP_ML} מ״ל לכוס</span>
        <span className="flex items-center gap-1.5">
          <button onClick={() => onSet(Math.max(0, Math.round((cups - 1) * 100) / 100))} disabled={cups <= 0} aria-label="הפחת כוס" className={btn + ' disabled:opacity-40'}>
            −
          </button>
          <button onClick={() => onSet(cups + 1)} aria-label="הוסף כוס" className={btn}>
            + כוס
          </button>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            aria-label="הקלדת מ״ל מים"
            placeholder="מ״ל"
            value={txt !== null ? txt : ''}
            onChange={(e) => setTxt(e.target.value)}
            onBlur={commitTxt}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitTxt();
                e.target.blur();
              }
            }}
            className="w-16 rounded-md px-2 py-1 text-[13px] text-ink text-center"
          />
        </span>
      </div>
    </div>
  );
}

export default function ProgressBars({ user, today, totals, day, entries }) {
  const weekend = !!day.wk;
  const goals = goalsFor(user, weekend);
  return (
    <section className="border border-line bg-surf rounded-lg p-3.5 space-y-3" aria-label="התקדמות יומית">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold tracking-wide text-mute">יעדים יומיים</span>
        <label className="flex items-center gap-2 text-xs font-bold">
          <span className={weekend ? 'text-brand' : 'text-mute'}>
            סופ״ש{weekend ? ' · ' + fmtN(PROFILES[user].weekendKcal) + ' קק״ל' : ''}
          </span>
          <Switch on={weekend} onChange={(v) => patchDay(user, today, { wk: v })} label="מצב סופ״ש" />
        </label>
      </div>
      {goals.map((g) => (
        <NutrientBar key={g.key} g={g} value={totals[g.key]} entries={entries} />
      ))}
      <div className="border-t border-line" />
      <SliderStat label="צעדים" value={day.steps || 0} onSet={(n) => patchDay(user, today, { steps: n })} goal={STEP_GOAL} bonus={STEP_BONUS} max={STEP_SLIDER_MAX} step={100} />
      {PROFILES[user].floors && <SliderStat label="קומות" value={day.floors || 0} onSet={(n) => patchDay(user, today, { floors: n })} goal={FLOOR_GOAL} bonus={FLOOR_BONUS} max={FLOOR_SLIDER_MAX} step={1} />}
      <WaterBar cups={day.water || 0} onSet={(n) => patchDay(user, today, { water: n })} />
    </section>
  );
}
