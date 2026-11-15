import { useState } from 'react';
import { CUP_GOAL, CUP_ML, OVER, PROFILES, STEP_BONUS, STEP_GOAL, goalsFor } from '../lib/config.js';
import { patchDay } from '../lib/actions.js';
import { fmtN, num } from '../lib/utils.js';
import { Switch, Track } from './ui.jsx';

function BarHead({ label, children }) {
  return (
    <div className="flex items-baseline justify-between mb-1.5 text-[13px]">
      <span className="font-bold">{label}</span>
      <span className="tnum text-mute">{children}</span>
    </div>
  );
}

function NutrientBar({ g, value }) {
  const over = value > g.goal;
  const bad = over && !g.okOver; // חלבון מעל היעד נשאר ירוק, השאר אדום
  const pct = Math.round((value / g.goal) * 100);
  const color = bad ? OVER : g.color;
  const strong = { color: bad ? OVER : 'var(--color-ink)' };
  return (
    <div>
      <BarHead label={g.label}>
        <b className="text-[15px]" style={strong}>{fmtN(value)}</b>
        {' / ' + fmtN(g.goal) + ' ' + g.unit + ' · '}
        <span style={strong}>{pct}%</span>
      </BarHead>
      <Track label={g.label} now={value} max={g.goal} segs={[{ from: 0, w: Math.min(100, pct), color }]} />
    </div>
  );
}

/* צעדים: עד 6,000 צבע אחד, ומעבר לכך ממשיכים בצבע אחר אל יעד הבונוס 8,000 */
function StepsBar({ steps, onSet }) {
  const base = (Math.min(steps, STEP_GOAL) / STEP_BONUS) * 100;
  const bonus = (Math.max(0, Math.min(steps, STEP_BONUS) - STEP_GOAL) / STEP_BONUS) * 100;
  const pct = Math.round((steps / STEP_GOAL) * 100);
  const reached = steps >= STEP_GOAL;
  const full = steps >= STEP_BONUS;
  const accent = full ? '#FACC15' : reached ? '#4ADE80' : 'var(--color-ink)';
  const [txt, setTxt] = useState(null);
  const commit = () => {
    if (txt !== null) {
      onSet(Math.round(num(txt)));
      setTxt(null);
    }
  };
  return (
    <div>
      <BarHead label="צעדים">
        <b className="text-[15px]" style={{ color: accent }}>{fmtN(steps)}</b>
        {' / ' + fmtN(STEP_GOAL) + ' · '}
        <span style={{ color: accent }}>{pct}%</span>
      </BarHead>
      <Track
        label="צעדים"
        now={steps}
        max={STEP_BONUS}
        ticks={[(STEP_GOAL / STEP_BONUS) * 100]}
        segs={[{ from: 0, w: base, color: '#2DD4BF' }, { from: base, w: bonus, color: '#FACC15' }]}
      />
      <div className="flex items-center justify-between mt-1.5 text-[11px] text-mute tnum">
        <span>{full ? 'בונוס הושג ✓' : reached ? 'עד הבונוס ' + fmtN(STEP_BONUS - steps) : 'עד היעד ' + fmtN(STEP_GOAL - steps)}</span>
        <span className="flex items-center gap-1.5">
          <input
            type="number"
            inputMode="numeric"
            min="0"
            aria-label="עדכון צעדים"
            placeholder="עדכון"
            value={txt !== null ? txt : ''}
            onChange={(e) => setTxt(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
                e.target.blur();
              }
            }}
            className="w-20 rounded-md px-2 py-1 text-[13px] text-ink text-center"
          />
          <button onClick={() => onSet(steps + 1000)} className="rounded-md border border-line px-2 py-1 font-bold text-ink">
            <span dir="ltr">+1,000</span>
          </button>
        </span>
      </div>
    </div>
  );
}

/* מים: כוס אחת = 350 מ״ל */
function WaterBar({ cups, onSet }) {
  const ml = cups * CUP_ML;
  const goal = CUP_GOAL * CUP_ML;
  const pct = Math.round((ml / goal) * 100);
  const btn = 'rounded-md border border-line px-2.5 py-1 font-bold text-ink';
  return (
    <div>
      <BarHead label="מים">
        <b className="text-[15px]" style={{ color: pct >= 100 ? '#4ADE80' : 'var(--color-ink)' }}>{fmtN(ml)}</b>
        {' / ' + fmtN(goal) + ' מ״ל · ' + pct + '%'}
      </BarHead>
      <Track label="מים" now={ml} max={goal} divs={CUP_GOAL} segs={[{ from: 0, w: Math.min(100, pct), color: '#22D3EE' }]} />
      <div className="flex items-center justify-between mt-1.5 text-[11px] text-mute tnum">
        <span>{cups} כוסות · {CUP_ML} מ״ל לכוס</span>
        <span className="flex items-center gap-1.5">
          <button onClick={() => onSet(Math.max(0, cups - 1))} disabled={cups <= 0} aria-label="הפחת כוס" className={btn + ' disabled:opacity-40'}>
            −
          </button>
          <button onClick={() => onSet(cups + 1)} aria-label="הוסף כוס" className={btn}>
            + כוס
          </button>
        </span>
      </div>
    </div>
  );
}

export default function ProgressBars({ user, today, totals, day }) {
  const weekend = !!day.wk;
  const goals = goalsFor(user, weekend);
  return (
    <section className="border border-line bg-surf rounded-lg p-4 space-y-4" aria-label="התקדמות יומית">
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
        <NutrientBar key={g.key} g={g} value={totals[g.key]} />
      ))}
      <div className="border-t border-line" />
      <StepsBar steps={day.steps || 0} onSet={(n) => patchDay(user, today, { steps: n })} />
      <WaterBar cups={day.water || 0} onSet={(n) => patchDay(user, today, { water: n })} />
    </section>
  );
}
