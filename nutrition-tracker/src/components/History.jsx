import { useMemo, useState } from 'react';
import { currentWeek, pastWeeks, rangeLabel } from '../lib/weeks.js';
import { AVG_START, CATS, CUP_ML, OVER, PROFILES, goalsFor } from '../lib/config.js';
import { useG } from '../lib/gender.js';
import { addEntryManual, editEntry, patchDay } from '../lib/actions.js';
import { FOOD_USER, Store, useStoreVersion } from '../lib/store.js';
import { catOf, fmtDay, fmtN, num, sumM, todayKey } from '../lib/utils.js';
import { AccordionItem, EditSheet, Field, MealChips, MealList, Switch, btnPrimary, inputCls } from './ui.jsx';
import Metrics from './Metrics.jsx';
import WorkShifts from './WorkShifts.jsx';
import WorkoutHistory from './WorkoutHistory.jsx';

function AddToDay({ user, date, foods }) {
  const g = useG();
  const [foodId, setFoodId] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('gram');
  const [meal, setMeal] = useState('lunch');
  const food = foods.find((f) => f.id === foodId);
  const qn = num(qty);
  const submit = () => {
    if (!food || qn <= 0) return;
    const alt = unit.startsWith('alt') && food.alt ? food.alt[Number(unit.slice(3))] : null;
    if (alt) addEntryManual(user, date, food, qn * alt.g, 'gram', meal); // יחידה נוספת (ראש, סלסילה…) מומרת לגרמים
    else addEntryManual(user, date, food, qn, unit, meal);
    setQty('');
  };
  return (
    <div className="rounded-md border border-line p-3 space-y-2">
      <div className="font-bold text-sm">{g('הוסף', 'הוסיפי')} מאכל ליום הזה</div>
      <select className={inputCls} value={foodId} onChange={(e) => {
          setFoodId(e.target.value);
          setUnit('gram');
        }} aria-label="מאכל">
        <option value="">{g('בחר', 'בחרי')} מאכל…</option>
        {CATS.map((c) => {
          const items = foods.filter((f) => catOf(f) === c.id);
          return items.length ? (
            <optgroup key={c.id} label={c.label}>
              {items.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </optgroup>
          ) : null;
        })}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <input className={inputCls} type="number" inputMode="decimal" min="0" placeholder="כמות" aria-label="כמות" value={qty} onChange={(e) => setQty(e.target.value)} />
        <select className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="יחידה">
          <option value="gram">גרם</option>
          <option value="serving">{food ? (food.uname || 'מנות') + ' (' + food.serving + ' גר׳)' : 'מנות'}</option>
          {food && (food.alt || []).map((a, i) => (
            <option key={a.n} value={'alt' + i}>
              {a.n} ({a.g} גר׳)
            </option>
          ))}
        </select>
      </div>
      <MealChips value={meal} onChange={setMeal} />
      <button onClick={submit} disabled={!food || qn <= 0} className={'w-full rounded-md py-2.5 font-bold disabled:opacity-40 ' + btnPrimary}>
        {g('הוסף', 'הוסיפי')} ליום
      </button>
    </div>
  );
}

/* עריכת נתוני יום: מים, צעדים וסופ״ש, גם לימים קודמים */
function DayEditor({ user, date, day }) {
  const [txt, setTxt] = useState(null);
  const [fTxt, setFTxt] = useState(null);
  const [mlTxt, setMlTxt] = useState(null);
  const commit = () => {
    if (txt !== null) {
      patchDay(user, date, { steps: Math.round(num(txt)) });
      setTxt(null);
    }
  };
  const commitFloors = () => {
    if (fTxt !== null) {
      patchDay(user, date, { floors: Math.round(num(fTxt)) });
      setFTxt(null);
    }
  };
  const commitMl = () => {
    if (mlTxt !== null) {
      if (String(mlTxt).trim() !== '') patchDay(user, date, { water: num(mlTxt) / CUP_ML });
      setMlTxt(null);
    }
  };
  const onEnter = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
    }
  };
  const btn = 'w-9 h-9 rounded-md border border-line font-bold';
  const cups = day.water || 0;
  return (
    <div className="rounded-md border border-line p-3 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-bold">מים</span>
        <span className="flex items-center gap-2 tnum">
          <button className={btn} aria-label="הפחת כוס" disabled={cups <= 0} onClick={() => patchDay(user, date, { water: Math.max(0, Math.round((cups - 1) * 100) / 100) })}>
            −
          </button>
          <span className="w-24 text-center">
            {Math.round(cups * 10) / 10} כוסות · {fmtN(cups * CUP_ML)} מ״ל
          </span>
          <button className={btn} aria-label="הוסף כוס" onClick={() => patchDay(user, date, { water: cups + 1 })}>
            +
          </button>
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="font-bold">מים במ״ל (הקלדה)</span>
        <input
          type="number"
          inputMode="numeric"
          min="0"
          aria-label="מים במ״ל ליום"
          className="w-28 rounded-md px-2 py-1.5 text-base text-ink text-center tnum"
          value={mlTxt !== null ? mlTxt : ''}
          placeholder={String(Math.round(cups * CUP_ML))}
          onChange={(e) => setMlTxt(e.target.value)}
          onBlur={commitMl}
          onKeyDown={onEnter}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="font-bold">צעדים</span>
        <input
          type="number"
          inputMode="numeric"
          min="0"
          aria-label="צעדים ליום"
          className="w-28 rounded-md px-2 py-1.5 text-base text-ink text-center tnum"
          value={txt !== null ? txt : day.steps || ''}
          placeholder="0"
          onChange={(e) => setTxt(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.target.blur();
            }
          }}
        />
      </div>
      {PROFILES[user].floors && (
        <div className="flex items-center justify-between">
          <span className="font-bold">קומות</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            aria-label="קומות ליום"
            className="w-28 rounded-md px-2 py-1.5 text-base text-ink text-center tnum"
            value={fTxt !== null ? fTxt : day.floors || ''}
            placeholder="0"
            onChange={(e) => setFTxt(e.target.value)}
            onBlur={commitFloors}
            onKeyDown={onEnter}
          />
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="font-bold">מצב סופ״ש (יעד {fmtN(PROFILES[user].weekendKcal)} קק״ל)</span>
        <Switch on={!!day.wk} onChange={(v) => patchDay(user, date, { wk: v })} label="מצב סופ״ש ליום" />
      </div>
    </div>
  );
}

/* שורות ממוצע לרשימת ימים. יום בלי נתונים נספר כאפס */
function AvgLines({ user, avgs }) {
  return (
    <>
      <p className="text-sm text-mute tnum">
        {fmtN(avgs.kcal)} קק״ל · {fmtN(avgs.p)} חלבון · {fmtN(avgs.c)} פחמימות · {fmtN(avgs.f)} שומן · {fmtN(avgs.fb)} סיבים
      </p>
      <p className="text-sm text-mute tnum">
        מים {fmtN(avgs.water)} מ״ל · צעדים {fmtN(avgs.steps)}
        {PROFILES[user].floors ? ' · קומות ' + fmtN(avgs.floors) : ''}
      </p>
    </>
  );
}

function NutritionHistory({ user, today }) {
  const g = useG();
  const ver = useStoreVersion();
  const [open, setOpen] = useState(null);
  const [editId, setEditId] = useState(null);
  const [extra, setExtra] = useState('');
  const log = useMemo(() => Store.list('log', user), [ver, user]);
  const foods = useMemo(() => Store.list('food', FOOD_USER), [ver, user]);
  const dayDocs = useMemo(() => Object.fromEntries(Store.list('day', user).map((d) => [d.date, d])), [ver, user]);

  const days = useMemo(() => {
    const map = {};
    log.forEach((e) => {
      (map[e.date] = map[e.date] || []).push(e);
    });
    Object.keys(dayDocs).forEach((k) => {
      if ((dayDocs[k].water || dayDocs[k].steps || dayDocs[k].floors) && !map[k]) map[k] = [];
    });
    if (!map[today]) map[today] = [];
    if (extra && !map[extra]) map[extra] = [];
    return Object.keys(map)
      .sort()
      .reverse()
      .map((date) => ({ date, items: map[date], t: sumM(map[date]), day: dayDocs[date] || { date, water: 0, steps: 0, wk: false } }));
  }, [log, dayDocs, extra, today]);

  const editing = log.find((e) => e.id === editId);
  // ממוצע שבועי (ראשון עד שבת). השבוע הנוכחי: מיום ראשון ועד אתמול, בלי היום. יום בלי נתונים נספר כאפס
  const nutri = useMemo(() => {
    const m = {};
    log.forEach((e) => {
      (m[e.date] = m[e.date] || []).push(e);
    });
    return m;
  }, [log]);
  const avgsOf = (list) => {
    const n = list.length;
    const mean = (fn) => (n ? Math.round(list.reduce((s, k) => s + fn(k), 0) / n) : 0);
    const out = {};
    ['kcal', 'p', 'c', 'f', 'fb'].forEach((k) => (out[k] = mean((d) => sumM(nutri[d] || [])[k])));
    out.water = mean((d) => ((dayDocs[d] && dayDocs[d].water) || 0) * CUP_ML);
    out.steps = mean((d) => (dayDocs[d] && dayDocs[d].steps) || 0);
    out.floors = mean((d) => (dayDocs[d] && dayDocs[d].floors) || 0);
    return out;
  };
  const cur = useMemo(() => currentWeek(today), [today]);
  const past = useMemo(() => pastWeeks(today, AVG_START), [today]);
  const [moreWeeks, setMoreWeeks] = useState(false);

  return (
    <div className="p-3 space-y-3">
      {editing && (
        <EditSheet
          key={editing.id}
          entry={editing}
          onClose={() => setEditId(null)}
          onSave={(p) => {
            editEntry(user, editing, p);
            setEditId(null);
          }}
        />
      )}
      <div className="bg-surf border border-line rounded-lg p-4 space-y-2">
        <h2 className="font-bold">ממוצע שבועי</h2>
        <div className="text-[11px] text-mute tnum">
          השבוע הנוכחי · {rangeLabel(cur)}
          {cur.days.length > 0 ? ' · ' + (cur.days.length === 1 ? 'יום אחד' : cur.days.length + ' ימים') + ' שהסתיימו (לא כולל היום)' : ''}
        </div>
        {cur.days.length > 0 ? (
          <AvgLines user={user} avgs={avgsOf(cur.days)} />
        ) : (
          <p className="text-sm text-mute">השבוע רק התחיל – הנתונים יעודכנו מחר</p>
        )}
        {past.length > 0 && (
          <div className="border-t border-line pt-2 space-y-2">
            <div className="text-[11px] font-bold text-mute">שבועות קודמים</div>
            {(moreWeeks ? past : past.slice(0, 1)).map((w) => (
              <div key={w.start} className="space-y-0.5">
                <div className="text-[11px] text-mute tnum">{rangeLabel(w)} · שבוע מלא</div>
                <AvgLines user={user} avgs={avgsOf(w.days)} />
              </div>
            ))}
            {past.length > 1 && (
              <button type="button" onClick={() => setMoreWeeks((o) => !o)} aria-expanded={moreWeeks} className="text-xs font-bold text-brand">
                {moreWeeks ? 'הסתר שבועות קודמים' : (past.length === 2 ? 'עוד שבוע קודם' : 'עוד ' + (past.length - 1) + ' שבועות קודמים')}
              </button>
            )}
          </div>
        )}
        <Field label={'יום שלא תועד? ' + g('בחר', 'בחרי') + ' תאריך'}>
          <input
            className={inputCls}
            type="date"
            max={todayKey()}
            value={extra}
            aria-label="בחירת תאריך"
            onChange={(e) => {
              setExtra(e.target.value);
              if (e.target.value) setOpen(e.target.value);
            }}
          />
        </Field>
      </div>

      <ul className="space-y-2">
        {days.map((d) => {
          const goals = goalsFor(user, d.day.wk);
          return (
            <li key={d.date} className="bg-surf border border-line rounded-lg overflow-hidden">
              <button className="w-full px-4 py-3 text-right" aria-expanded={open === d.date} onClick={() => setOpen(open === d.date ? null : d.date)}>
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold">
                    {d.date === today ? 'היום · ' : ''}
                    {fmtDay(d.date)}
                    {d.day.wk ? ' · סופ״ש' : ''}
                  </span>
                  <span className="text-xs text-mute">
                    {d.items.length} רשומות {open === d.date ? '▴' : '▾'}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {goals.map((gl) => {
                    const v = d.t[gl.key];
                    const bad = v > gl.goal && !gl.okOver;
                    return (
                      <div key={gl.key} className="text-center">
                        <div className="text-[11px] text-mute">{gl.label}</div>
                        <div className="font-extrabold tnum" style={{ color: bad ? OVER : undefined }}>
                          {fmtN(v)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {d.day.water || d.day.steps || d.day.floors ? (
                  <div className="text-[11px] text-mute mt-2 tnum">
                    מים {fmtN((d.day.water || 0) * CUP_ML)} מ״ל · צעדים {fmtN(d.day.steps || 0)}{PROFILES[user].floors ? ' · קומות ' + (d.day.floors || 0) : ''}
                  </div>
                ) : null}
              </button>
              {open === d.date && (
                <div className="border-t border-line px-3 py-3 space-y-3">
                  {d.items.length ? (
                    <MealList entries={d.items} onDelete={(id) => Store.remove('log', user, id)} onEdit={setEditId} />
                  ) : (
                    <p className="text-sm text-mute px-1">אין רשומות ביום הזה.</p>
                  )}
                  <AddToDay user={user} date={d.date} foods={foods} />
                  <DayEditor user={user} date={d.date} day={d.day} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* מרכז נתונים: אקורדיון לפי המשתמש (אוד מקבלת גם "עבודה") */
export default function History({ user, today }) {
  const [open, setOpen] = useState(null);
  const sections = [
    { id: 'metrics', title: 'מדדים', body: <div className="p-3"><Metrics user={user} /></div> },
    { id: 'nutrition', title: 'תזונה', body: <NutritionHistory user={user} today={today} /> },
    { id: 'workouts', title: 'אימונים', body: <WorkoutHistory user={user} /> },
    ...(PROFILES[user].instructor ? [{ id: 'work', title: 'עבודה', body: <WorkShifts user={user} today={today} /> }] : []),
  ];
  return (
    <section className="px-4 space-y-2">
      {sections.map((x) => (
        <AccordionItem key={x.id} title={x.title} open={open === x.id} onToggle={() => setOpen(open === x.id ? null : x.id)}>
          {x.body}
        </AccordionItem>
      ))}
    </section>
  );
}
