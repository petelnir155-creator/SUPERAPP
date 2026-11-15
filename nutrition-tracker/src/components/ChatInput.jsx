import { useEffect, useRef, useState } from 'react';
import { OVER } from '../lib/config.js';
import { useG } from '../lib/gender.js';
import { aiActions } from '../lib/ai.js';
import { localActions } from '../lib/parser.js';
import { applyActions } from '../lib/actions.js';
import { Store } from '../lib/store.js';
import { autoMeal, fmtN, nowTime, r1, uid } from '../lib/utils.js';
import { IconSend, btnPrimary } from './ui.jsx';

function BotMessage({ m, last, onUndo }) {
  const out = m.out;
  const changed = out && (out.added.length || out.updated.length);
  return (
    <div className="self-end max-w-[94%] border border-line rounded-lg px-3 py-2 text-sm space-y-1 bg-surf2">
      {out &&
        out.added.map((e) => (
          <div key={e.id} className="flex justify-between gap-3 tnum">
            <span className="min-w-0">
              <span className="text-brand">＋</span> {e.name} <span className="text-mute">· {r1(e.g)} גר׳</span>
              {e.est ? <span className="text-xs text-amber-400"> · הערכה</span> : null}
            </span>
            <span className="text-mute shrink-0">{fmtN(e.kcal)} קק״ל · {r1(e.p)} ח׳</span>
          </div>
        ))}
      {out &&
        out.updated.map((u) => (
          <div key={u.id} className="flex justify-between gap-3 tnum">
            <span className="min-w-0">
              <span className="text-amber-400">↻</span> {u.name} <span className="text-mute">· {r1(u.from)} ← {r1(u.to)} גר׳</span>
            </span>
            <span className="text-mute shrink-0">{fmtN(u.kcal)} קק״ל</span>
          </div>
        ))}
      {out && out.dup ? <div className="text-mute">הפעולה כבר בוצעה.</div> : null}
      {out && !changed && !out.dup ? <div className="text-mute">לא בוצע שינוי.</div> : null}
      {m.unknown && m.unknown.length ? (
        <div className="text-xs" style={{ color: OVER }}>לא זוהה: {m.unknown.join(', ')}</div>
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

/*
  אזור ההזנה. מנסה AI (אם הוגדר מפתח) ואם נכשל, עובר לניתוח מקומי.
  הגנה מפני כפילויות: נעילה סינכרונית אחת לשליחה, הטקסט נקרא ומתנקה סינכרונית,
  ולכל שליחה יש op ייחודי ש-applyActions לא מבצע פעמיים.
*/
export default function ChatInput({ user, today, msgs, setMsgs, aiCfg }) {
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
      const ctx = { foods: Store.list('food', user), entries: Store.list('log', user).filter((e) => e.date === today) };
      let res = null;
      let note = '';
      if (aiOn) {
        try {
          res = await aiActions(t, ctx, aiCfg);
        } catch (e) {
          note = 'ניתוח ה-AI נכשל (' + String((e && e.message) || e).slice(0, 120) + '). בוצע ניתוח מקומי.';
        }
      }
      if (!res) res = localActions(t, ctx);
      const out = applyActions(user, res.actions, { op, today, meal: autoMeal(), time: nowTime() });
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
    if (m.role === 'bot' && m.out && (m.out.added.length || m.out.updated.length)) lastChange = i;
  });

  return (
    <section className="border border-line bg-surf rounded-lg p-3 flex flex-col gap-3" aria-label="צ׳אט הזנה">
      {msgs.length > 0 || busy ? (
        <div ref={listRef} aria-live="polite" className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: '34dvh' }}>
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
          aria-label="מה אכלת"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="מה אכלת?"
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
