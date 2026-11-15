import { useRef, useState } from 'react';
import { OVER, goalsFor } from '../lib/config.js';
import { aiSuggest } from '../lib/ai.js';
import { Store } from '../lib/store.js';
import { r1 } from '../lib/utils.js';

/* "מה לאכול עכשיו?": שולח ל-Claude את מה שנשאר ליעד היום ומציג המלצה קצרה */
export default function FoodAdvisor({ user, totals, weekend, entries, aiCfg }) {
  const [st, setSt] = useState({ busy: false, text: '', err: '' });
  const lock = useRef(false);
  const aiOn = !!(aiCfg.key && aiCfg.key.trim());

  const run = async () => {
    if (lock.current) return;
    if (!aiOn) {
      setSt({ busy: false, text: '', err: 'כדי לקבל המלצה צריך מפתח API של Anthropic בהגדרות ← AI.' });
      return;
    }
    lock.current = true;
    setSt({ busy: true, text: '', err: '' });
    try {
      const goals = goalsFor(user, weekend);
      const kcalGoal = goals[0].goal;
      const proteinGoal = goals[1].goal;
      const info = {
        remaining: { kcal: Math.round(kcalGoal - totals.kcal), protein_g: Math.round(proteinGoal - totals.p) },
        goals: { kcal: kcalGoal, protein_g: proteinGoal },
        eaten: entries.map((e) => ({ name: e.name, grams: r1(e.g), kcal: Math.round(e.kcal), protein: r1(e.p) })),
        foods: Store.list('food', user).map((f) => ({
          name: f.name, per100g: { kcal: f.kcal, p: f.p }, unit: f.uname || null, unitGrams: f.serving,
        })),
      };
      const text = await aiSuggest(info, aiCfg);
      setSt({ busy: false, text, err: '' });
    } catch (e) {
      setSt({ busy: false, text: '', err: 'ההמלצה נכשלה (' + String((e && e.message) || e).slice(0, 120) + ')' });
    }
    lock.current = false;
  };

  return (
    <div>
      <button
        onClick={run}
        disabled={st.busy}
        className="w-full rounded-lg border border-line bg-surf py-3 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
      >
        <span aria-hidden="true">💡</span> {st.busy ? 'חושב…' : 'מה לאכול עכשיו?'}
      </button>
      {st.text || st.err ? (
        <div role="status" className="mt-2 border border-line rounded-lg px-3 py-2.5 text-sm leading-relaxed flex gap-2 items-start bg-surf2">
          <div className="flex-1" style={{ color: st.err ? OVER : 'var(--color-ink)' }}>
            {st.text || st.err}
          </div>
          <button onClick={() => setSt({ busy: false, text: '', err: '' })} aria-label="סגור" className="text-mute text-lg leading-none">
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
