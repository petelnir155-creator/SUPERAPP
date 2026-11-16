import { useEffect, useMemo, useRef, useState } from 'react';
import { OVER, PROFILES } from '../lib/config.js';
import { useG } from '../lib/gender.js';
import { aiWorkout } from '../lib/ai.js';
import { Store, useStoreVersion } from '../lib/store.js';
import {
  EX_CATS, applyWorkout, catLabel, exercisesOf, fmtHours, fmtLog, hasData, lastPerformance, localWorkout, logsOf, prevText,
  removeShift, removeWorkout, saveLog, shiftsOf, startExercise,
} from '../lib/workouts.js';
import { fmtDay, fmtN, nowTime, num, uid } from '../lib/utils.js';
import { ExerciseInfo, InfoButton } from './ExerciseInfo.jsx';
import { IconSend, Modal, btnPrimary, chipOn, inputCls } from './ui.jsx';

/* שדה מספר שנשמר מיד כשעוזבים אותו, בלי כפתור שמירה */
function NumInput({ value, onCommit, label, placeholder }) {
  const [t, setT] = useState(value > 0 ? String(value) : '');
  const focus = useRef(false);
  useEffect(() => {
    if (!focus.current) setT(value > 0 ? String(value) : '');
  }, [value]);
  const commit = () => {
    focus.current = false;
    const n = num(t);
    if (n !== value) onCommit(n);
  };
  return (
    <input
      type="number"
      inputMode="decimal"
      min="0"
      step="any"
      aria-label={label}
      placeholder={placeholder}
      value={t}
      onFocus={() => (focus.current = true)}
      onChange={(e) => setT(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.target.blur();
        }
      }}
      className="w-full rounded-md px-2 py-1.5 text-[15px] text-ink text-center tnum"
    />
  );
}

const Unit = ({ children }) => <span className="text-xs text-mute shrink-0">{children}</span>;

/* שדות העריכה לפי סוג האימון */
const FIELDS = {
  machine: [{ key: 'minutes', label: 'דקות', unit: 'דק׳' }, { key: 'speed', label: 'מהירות ממוצעת', unit: 'קמ״ש' }],
  run: [{ key: 'km', label: 'מרחק', unit: 'ק״מ' }, { key: 'minutes', label: 'זמן', unit: 'דק׳' }],
  pilates: [{ key: 'minutes', label: 'דקות', unit: 'דק׳' }],
};

function Editor({ user, today, w, prev }) {
  const ex = { id: w.exId, name: w.name, cat: w.cat, type: w.type };
  const save = (patch) => saveLog(user, today, ex, patch, w.time);
  if (w.type !== 'strength') {
    return (
      <div className="flex items-center gap-3">
        {FIELDS[w.type].map((f) => (
          <div key={f.key} className="flex-1 flex items-center gap-1.5">
            <NumInput value={w[f.key]} label={f.label} placeholder="0" onCommit={(n) => save({ [f.key]: n })} />
            <Unit>{f.unit}</Unit>
          </div>
        ))}
      </div>
    );
  }
  const setSets = (sets) => save({ sets });
  const patch = (i, p) => {
    const next = { ...w.sets[i], ...p };
    next.bw = !(next.kg > 0);
    setSets(w.sets.map((s, j) => (j === i ? next : s)));
  };
  const addSet = () => {
    const seed = (prev && prev.sets[w.sets.length]) || w.sets[w.sets.length - 1] || { reps: 0, kg: 0 };
    setSets([...w.sets, { reps: seed.reps, kg: seed.kg, bw: !(seed.kg > 0) }]);
  };
  return (
    <div className="space-y-1.5">
      {w.sets.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-5 text-xs text-mute tnum shrink-0">{i + 1}</span>
          <div className="flex-1 flex items-center gap-1.5">
            <NumInput value={s.kg} label={'משקל, סט ' + (i + 1)} placeholder="גוף" onCommit={(n) => patch(i, { kg: n })} />
            <Unit>ק״ג</Unit>
          </div>
          <div className="flex-1 flex items-center gap-1.5">
            <NumInput value={s.reps} label={'חזרות, סט ' + (i + 1)} placeholder="0" onCommit={(n) => patch(i, { reps: Math.round(n) })} />
            <Unit>חז׳</Unit>
          </div>
          <button onClick={() => setSets(w.sets.filter((_, j) => j !== i))} aria-label={'מחק סט ' + (i + 1)} className="w-8 h-8 rounded-md text-lg leading-none text-mute border border-line shrink-0">
            ×
          </button>
        </div>
      ))}
      <button onClick={addSet} className="w-full rounded-md border border-line py-2 text-sm font-bold">
        + סט
      </button>
    </div>
  );
}

function Tile({ value, label }) {
  return (
    <div className="border border-line rounded-md bg-surf2 px-2 py-2 text-center">
      <div className="font-extrabold tnum">{value}</div>
      <div className="text-[11px] text-mute">{label}</div>
    </div>
  );
}

/* האימונים שבוצעו היום: סיכום, ורשימת תרגילים בעיצוב של רשימת הארוחות */
function TodayWorkouts({ user, today, ver, openId, setOpenId, onInfo }) {
  const logs = useMemo(
    () => logsOf(user).filter((w) => w.date === today).sort((a, b) => (a.time || '').localeCompare(b.time || '') || a.name.localeCompare(b.name, 'he')),
    [ver, user, today], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const todayShifts = useMemo(() => shiftsOf(user).filter((s) => s.date === today), [ver, user, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = logs.filter(hasData);
  const sets = done.reduce((t, w) => t + w.sets.length, 0);
  const volume = done.reduce((t, w) => t + w.sets.reduce((a, s) => a + s.reps * s.kg, 0), 0);
  const minutes = done.reduce((t, w) => t + (w.type === 'strength' ? 0 : w.minutes), 0);
  return (
    <section className="border border-line bg-surf rounded-lg p-4 space-y-4" aria-label="אימוני היום">
      <div className="text-xs font-bold tracking-wide text-mute">אימוני היום</div>
      <div className="grid grid-cols-4 gap-2">
        <Tile value={done.length} label="תרגילים" />
        <Tile value={sets} label="סטים" />
        <Tile value={fmtN(Math.round(volume))} label="נפח ק״ג" />
        <Tile value={fmtN(Math.round(minutes))} label="דקות" />
      </div>
      {logs.length || todayShifts.length ? (
        <ul className="space-y-1.5">
          {logs.map((w) => {
            const prev = lastPerformance(user, w.exId, today);
            const open = openId === w.id || !hasData(w);
            const exDoc = Store.get('ex', user, w.exId);
            return (
              <li key={w.id} className="border border-line rounded-md px-3 py-2.5 bg-surf2 space-y-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs text-mute w-10 shrink-0 tnum">{w.time || ''}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold">
                      {w.name}
                      {exDoc && exDoc.tips && exDoc.tips.length ? (
                        <>
                          {' '}
                          <InfoButton name={w.name} onClick={() => onInfo(exDoc)} />
                        </>
                      ) : null}
                    </div>
                    <div className="text-xs tnum" style={{ color: hasData(w) ? 'var(--color-ink)' : 'var(--color-mute)' }}>
                      <span className="text-mute">{catLabel(w.cat)} · </span>
                      {hasData(w) ? fmtLog(w) : 'ללא נתונים'}
                    </div>
                    <div className="text-xs text-mute tnum">{prev ? 'אימון קודם: ' + prevText(prev) : 'אין ביצוע קודם'}</div>
                  </div>
                  <button onClick={() => setOpenId(open && hasData(w) ? null : w.id)} aria-label={'ערוך ' + w.name} aria-expanded={open} className="w-9 h-9 rounded-md text-mute border border-line">
                    ✎
                  </button>
                  <button onClick={() => removeWorkout(user, today, w.exId)} aria-label={'מחק ' + w.name} className="w-9 h-9 rounded-md text-xl leading-none text-mute border border-line">
                    ×
                  </button>
                </div>
                {open ? <Editor user={user} today={today} w={w} prev={prev} /> : null}
              </li>
            );
          })}
          {todayShifts.map((s) => (
            <li key={s.id} className="border border-line rounded-md px-3 py-2.5 bg-surf2 flex items-center gap-2.5">
              <div className="flex-1 min-w-0">
                <div className="font-bold">הדרכה</div>
                <div className="text-xs text-mute tnum">{fmtHours(s.minutes)} שע׳</div>
              </div>
              <button onClick={() => removeShift(user, s.id)} aria-label="מחק משמרת הדרכה" className="w-9 h-9 rounded-md text-xl leading-none text-mute border border-line">
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function PastDays({ user, today, ver }) {
  const days = useMemo(() => {
    const map = {};
    logsOf(user).forEach((w) => {
      if (w.date < today && hasData(w)) (map[w.date] = map[w.date] || []).push(w);
    });
    return Object.keys(map).sort().reverse().slice(0, 7).map((d) => ({ date: d, items: map[d].sort((a, b) => (a.time || '').localeCompare(b.time || '')) }));
  }, [ver, user, today]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!days.length) return null;
  return (
    <details className="border border-line bg-surf rounded-lg">
      <summary className="px-4 py-3 font-bold text-sm cursor-pointer">אימונים קודמים</summary>
      <div className="border-t border-line divide-y divide-line">
        {days.map((d) => (
          <div key={d.date} className="px-4 py-2.5 space-y-1">
            <div className="text-xs text-mute">{fmtDay(d.date)}</div>
            {d.items.map((w) => (
              <div key={w.id} className="flex justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{w.name}</span>
                <span className="text-mute tnum shrink-0">{fmtLog(w)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </details>
  );
}

function ExercisePicker({ user, today, onPick, onClose, onInfo }) {
  const g = useG();
  const ver = useStoreVersion();
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const list = useMemo(() => exercisesOf(user), [ver, user]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = list.filter((e) => (cat === 'all' || e.cat === cat) && (!q.trim() || e.name.includes(q.trim())));
  const chip = (id, label) => (
    <button key={id} type="button" aria-pressed={cat === id} onClick={() => setCat(id)} className={'shrink-0 rounded-full px-3 py-1.5 text-sm font-bold border border-line ' + (cat === id ? chipOn : 'text-ink')}>
      {label}
    </button>
  );
  return (
    <Modal title="הוספת תרגיל" onClose={onClose}>
      <input className={inputCls + ' mt-0 mb-3'} type="search" placeholder={g('חפש תרגיל', 'חפשי תרגיל')} aria-label="חיפוש תרגיל" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex gap-2 overflow-x-auto pb-2 mb-2">{[chip('all', 'הכול'), ...EX_CATS.map((c) => chip(c.id, c.label))]}</div>
      <ul className="space-y-1.5">
        {shown.map((e) => {
          const prev = lastPerformance(user, e.id, today);
          return (
            <li key={e.id} className="flex items-stretch gap-1.5">
              <button onClick={() => onPick(e)} className="flex-1 min-w-0 text-right border border-line bg-surf rounded-md px-3 py-2.5 flex justify-between gap-3 items-center">
                <span className="font-bold min-w-0">{e.name}</span>
                <span className="text-xs text-mute tnum shrink-0">{prev ? prevText(prev) : catLabel(e.cat)}</span>
              </button>
              {e.tips && e.tips.length ? (
                <button onClick={() => onInfo(e)} aria-label={'דגשים: ' + e.name} className="w-11 rounded-md border border-line text-mute">
                  i
                </button>
              ) : null}
            </li>
          );
        })}
        {!shown.length ? <li className="text-sm text-mute px-1">לא נמצאו תרגילים</li> : null}
      </ul>
    </Modal>
  );
}

function BotMessage({ m, last, onUndo }) {
  const out = m.out;
  const changed = out && (out.added.length || out.shifts.length);
  return (
    <div className="self-end max-w-[94%] border border-line rounded-lg px-3 py-2 text-sm space-y-1.5 bg-surf2">
      {out &&
        out.added.map((e) => (
          <div key={e.id}>
            <div className="flex justify-between gap-3 tnum">
              <span className="min-w-0">
                <span className="text-brand">＋</span> {e.name}
                <span className="text-xs text-mute"> · {catLabel(e.cat)}</span>
                {e.created ? <span className="text-xs text-warn"> · נוסף למאגר</span> : null}
              </span>
              <span className="text-mute shrink-0">{e.summary}</span>
            </div>
            {e.prev ? <div className="text-xs text-mute tnum">אימון קודם: {e.prev}</div> : null}
          </div>
        ))}
      {out &&
        out.shifts.map((s) => (
          <div key={s.id} className="flex justify-between gap-3 tnum">
            <span>
              <span className="text-brand">＋</span> משמרת הדרכה
            </span>
            <span className="text-mute shrink-0">{fmtHours(s.minutes)} שע׳</span>
          </div>
        ))}
      {out && out.dup ? <div className="text-mute">הפעולה כבר בוצעה.</div> : null}
      {out && !changed && !out.dup ? <div className="text-mute">לא בוצע שינוי.</div> : null}
      {m.unknown && m.unknown.length ? (
        <div className="text-xs" style={{ color: OVER }}>
          לא זוהה: {m.unknown.join(', ')}
        </div>
      ) : null}
      {m.note ? <div className="text-xs text-mute">{m.note}</div> : null}
      {changed && last && !m.undone ? (
        <button onClick={onUndo} className="text-xs font-bold underline text-mute">
          ביטול
        </button>
      ) : null}
      {m.undone ? <div className="text-xs text-mute">בוטל</div> : null}
    </div>
  );
}

/* אותו מבנה בדיוק כמו שורת "מה אכלת?": נעילה, טקסט סינכרוני ו-op ייחודי נגד כפילויות */
function WorkoutChat({ user, today, msgs, setMsgs, aiCfg }) {
  const g = useG();
  const aiOn = !!(aiCfg.key && aiCfg.key.trim());
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const textRef = useRef('');
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs.length, busy]);

  const edit = (v) => {
    textRef.current = v;
    setText(v);
  };

  const send = async () => {
    const t = textRef.current.trim().slice(0, 600);
    if (!t || lock.current) return;
    lock.current = true;
    setBusy(true);
    edit('');
    const op = uid();
    setMsgs((l) => [...l, { role: 'user', text: t }]);
    let bot;
    try {
      const canShift = !!PROFILES[user].instructor;
      const ctx = { user, today, exercises: exercisesOf(user), canShift };
      let res = null;
      let note = '';
      if (aiOn) {
        try {
          res = await aiWorkout(t, ctx, aiCfg);
        } catch (e) {
          note = 'ניתוח ה-AI נכשל (' + String((e && e.message) || e).slice(0, 120) + '). בוצע ניתוח מקומי.';
        }
      }
      if (!res) res = localWorkout(t, ctx);
      const out = applyWorkout(user, res.actions, { op, today, time: nowTime(), canShift });
      bot = { role: 'bot', out, unknown: res.unknown, note };
    } catch (e) {
      bot = { role: 'bot', out: null, unknown: [], note: 'שגיאה: ' + String((e && e.message) || e).slice(0, 120) };
    }
    setMsgs((l) => [...l, bot]);
    lock.current = false;
    setBusy(false);
  };

  const undo = (idx) => {
    const m = msgs[idx];
    if (!m || !m.out || m.undone) return;
    Store.undo(m.out.snap);
    setMsgs((l) => l.map((x, i) => (i === idx ? { ...x, undone: true } : x)));
  };

  let lastChange = -1;
  msgs.forEach((m, i) => {
    if (m.role === 'bot' && m.out && (m.out.added.length || m.out.shifts.length)) lastChange = i;
  });

  return (
    <section className="border border-line bg-surf rounded-lg p-3 flex flex-col gap-3" aria-label="צ׳אט אימון">
      {msgs.length > 0 || busy ? (
        <div ref={listRef} aria-live="polite" className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: '26dvh' }}>
          {msgs.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="self-start max-w-[94%] rounded-lg px-3 py-2 text-sm border border-line">
                {m.text}
              </div>
            ) : (
              <BotMessage key={i} m={m} last={i === lastChange} onUndo={() => undo(i)} />
            ),
          )}
          {busy ? <div className="self-end text-xs text-mute px-1">מנתח…</div> : null}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <textarea
          rows="2"
          maxLength="600"
          value={text}
          onChange={(e) => edit(e.target.value)}
          aria-label="מה עשית באימון"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="מה עשית?"
          className="flex-1 rounded-md px-3 py-2.5 text-base text-ink"
          style={{ resize: 'none' }}
        />
        <button
          onClick={send}
          disabled={!text.trim() || busy}
          aria-label={g('שלח', 'שלחי')}
          className={'shrink-0 h-[46px] w-[46px] rounded-md flex items-center justify-center disabled:opacity-40 ' + btnPrimary}
        >
          <IconSend />
        </button>
      </div>
      <div className="text-[11px] text-mute -mt-1">{aiOn ? 'AI פעיל' : 'ניתוח מקומי'}</div>
    </section>
  );
}

export default function Workouts({ user, today, msgs, setMsgs, aiCfg, onOpenExercises }) {
  const ver = useStoreVersion();
  const [picking, setPicking] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [info, setInfo] = useState(null);
  return (
    <section className="flex-1 flex flex-col gap-3 px-4">
      <TodayWorkouts user={user} today={today} ver={ver} openId={openId} setOpenId={setOpenId} onInfo={setInfo} />
      <PastDays user={user} today={today} ver={ver} />
      <div className="mt-auto pt-2 flex flex-col gap-2">
        <WorkoutChat user={user} today={today} msgs={msgs} setMsgs={setMsgs} aiCfg={aiCfg} />
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setPicking(true)} className="rounded-lg border border-line bg-surf py-3 font-bold text-sm">
            + תרגיל מהמאגר
          </button>
          <button onClick={onOpenExercises} className="rounded-lg border border-line bg-surf py-3 font-bold text-sm">
            מאגר תרגילים
          </button>
        </div>
      </div>
      {picking ? (
        <ExercisePicker
          user={user}
          today={today}
          onClose={() => setPicking(false)}
          onInfo={setInfo}
          onPick={(e) => {
            setOpenId(startExercise(user, today, e, nowTime()));
            setPicking(false);
          }}
        />
      ) : null}
      {info ? <ExerciseInfo ex={info} onClose={() => setInfo(null)} /> : null}
    </section>
  );
}
