import { useEffect, useMemo, useState } from 'react';
import { useG } from '../lib/gender.js';
import { Store, useStoreVersion } from '../lib/store.js';
import { Cloud } from '../lib/supabaseClient.js';
import { useExerciseMedia } from '../lib/exerciseMedia.js';
import { HOME_LABEL, HOME_TAG } from '../lib/exercises.js';
import { EX_CATS, addExercise, exercisesOf, lastPerformance, prevText } from '../lib/workouts.js';
import { AccordionItem, Field, btnPrimary, chipOn, inputCls } from './ui.jsx';

/* מאגר התרגילים כאקורדיון היררכי:
   רמה 1: קבוצת שריר. רמה 2: התרגילים שלה. רמה 3: כרטיסייה מורחבת עם דגשים, תמונות ופעולות. */
const PANEL_CATS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs']; // בלי אירובי ופילאטיס. בטן מוצגת רק אם יש בה תרגילים
const EMPTY = { id: null, name: '', cat: 'chest', en: '', tips: '', tag: '', muscle_img_url: '', movement_img_url: '' };
const HOME_ID = 'home'; // מזהה פנימי של קבוצת האקורדיון (לא קבוצת שריר)

/* תמונה לפי כתובת. בלי כתובת או כשהטעינה נכשלת: ריבוע אפור עם אייקון וטקסט */
function ImageSlot({ url, label, icon }) {
  const [bad, setBad] = useState(false);
  const show = url && !bad;
  return (
    <figure className="m-0 min-w-0">
      <div className="aspect-square w-full rounded-lg border border-line bg-surf2 overflow-hidden flex items-center justify-center">
        {show ? (
          <img src={url} alt={label} loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-mute px-2 text-center" role="img" aria-label={label + ' (תמונה תתווסף בהמשך)'}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {icon === 'muscle' ? (
                <path d="M12 3c2.5 0 4 2 4 4.5 0 1.4-.5 2.4-1 3.2 1.6.8 3 2.4 3 5.3V21H6v-5c0-2.9 1.4-4.5 3-5.3-.5-.8-1-1.8-1-3.2C8 5 9.5 3 12 3z" />
              ) : (
                <>
                  <circle cx="12" cy="5" r="2" />
                  <path d="M12 7v6m0 0-3 7m3-7 3 7M7 10l5-1 5 1" />
                </>
              )}
            </svg>
            <span className="text-xs font-bold">{label}</span>
            <span className="text-[11px]">תתווסף בהמשך</span>
          </div>
        )}
      </div>
      {show ? <figcaption className="text-xs text-mute text-center mt-1">{label}</figcaption> : null}
    </figure>
  );
}

/* טופס הוספה / עריכה של תרגיל */
function ExerciseForm({ user, init, onDone }) {
  const g = useG();
  const [form, setForm] = useState(init);
  const canSave = !!form.name.trim();
  const save = () => {
    if (!canSave) return;
    addExercise(user, { ...form, tips: form.tips.split('\n') });
    onDone(form.tag === HOME_TAG ? HOME_ID : form.cat);
  };
  return (
    <div className="space-y-3">
      <Field label="שם התרגיל">
        <input className={inputCls} type="text" maxLength="60" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </Field>
      <Field label="שם באנגלית (לא חובה)">
        <input className={inputCls} type="text" dir="ltr" maxLength="60" value={form.en} onChange={(e) => setForm({ ...form, en: e.target.value })} />
      </Field>
      <Field label="דגשים טכניים (שורה לכל דגש)">
        <textarea className={inputCls} rows="3" maxLength="600" value={form.tips} onChange={(e) => setForm({ ...form, tips: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="תמונת אנטומיה (כתובת)">
          <input className={inputCls} type="url" dir="ltr" inputMode="url" placeholder="https://…" value={form.muscle_img_url} onChange={(e) => setForm({ ...form, muscle_img_url: e.target.value })} />
        </Field>
        <Field label="תמונת תנועה (כתובת)">
          <input className={inputCls} type="url" dir="ltr" inputMode="url" placeholder="https://…" value={form.movement_img_url} onChange={(e) => setForm({ ...form, movement_img_url: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="קבוצת שריר">
        {EX_CATS.filter((c) => PANEL_CATS.includes(c.id) || c.id === form.cat).map((c) => (
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
      <button
        type="button"
        aria-pressed={form.tag === HOME_TAG}
        onClick={() => setForm({ ...form, tag: form.tag === HOME_TAG ? '' : HOME_TAG })}
        className={'w-full rounded-md py-2 text-sm font-bold border border-line ' + (form.tag === HOME_TAG ? chipOn : 'text-ink')}
      >
        {HOME_LABEL}
      </button>
      <div className="flex gap-2">
        <button onClick={() => onDone(null)} className="flex-1 rounded-md py-2.5 font-bold border border-line">
          ביטול
        </button>
        <button onClick={save} disabled={!canSave} className={'flex-1 rounded-md py-2.5 font-bold disabled:opacity-40 ' + btnPrimary}>
          {init.id ? g('שמור', 'שמרי') : g('הוסף', 'הוסיפי')}
        </button>
      </div>
    </div>
  );
}

/* רמה 3: תוכן הכרטיסייה של תרגיל */
function ExerciseCard({ user, today, e, onAdd, onEdit }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const prev = lastPerformance(user, e.id, today);
  const tips = e.tips || [];
  const media = useExerciseMedia().get(user, e.id); // העמודות muscle_img_url / movement_img_url ב-exercise_db
  const muscleUrl = e.muscle_img_url || media.m; // כתובת שהוזנה בעריכה גוברת, אחרת מהמסד
  const moveUrl = e.movement_img_url || media.v;
  return (
    <div className="px-3 pb-3 pt-1 space-y-3">
      {e.en ? (
        <div dir="ltr" className="text-sm text-mute text-right">
          {e.en}
        </div>
      ) : null}
      {e.tag === HOME_TAG ? <div className="text-xs text-mute">קבוצת שריר: {(EX_CATS.find((c) => c.id === e.cat) || {}).label || e.cat}</div> : null}
      <div className="grid grid-cols-2 gap-2.5">
        <ImageSlot key={muscleUrl} url={muscleUrl} label="אנטומיה (שריר)" icon="muscle" />
        <ImageSlot key={moveUrl} url={moveUrl} label="תנועה" icon="move" />
      </div>
      {tips.length ? (
        <div>
          <div className="text-xs font-bold tracking-wide text-mute mb-1.5">דגשים</div>
          <ul className="space-y-2">
            {tips.map((t, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed">
                <span className="text-brand shrink-0" aria-hidden="true">
                  •
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-mute">עוד אין דגשים לתרגיל הזה. אפשר להוסיף בעריכה.</p>
      )}
      {prev ? <div className="text-xs text-mute tnum">אימון קודם: {prevText(prev)}</div> : null}
      <button onClick={() => onAdd(e)} className={'w-full rounded-lg py-3.5 text-base font-extrabold ' + btnPrimary}>
        עשיתי את התרגיל!
      </button>
      <div className="flex gap-2">
        <button onClick={() => onEdit(e)} aria-label={'ערוך ' + e.name} className="flex-1 rounded-md border border-line py-2 text-sm font-bold text-mute">
          ✎ עריכה
        </button>
        {confirmDel ? (
          <button onClick={() => Store.remove('ex', user, e.id)} aria-label={'אשר מחיקת ' + e.name} className="flex-1 rounded-md border border-line py-2 text-sm font-bold" style={{ color: 'var(--color-over, #f87171)' }}>
            בטוח? מחק
          </button>
        ) : (
          <button onClick={() => setConfirmDel(true)} aria-label={'מחק ' + e.name} className="flex-1 rounded-md border border-line py-2 text-sm font-bold text-mute">
            × מחיקה
          </button>
        )}
      </div>
    </div>
  );
}

export default function ExerciseBank({ user, today, onAdd }) {
  const g = useG();
  const ver = useStoreVersion();
  const list = useMemo(() => exercisesOf(user), [ver, user]); // eslint-disable-line react-hooks/exhaustive-deps
  const [openCat, setOpenCat] = useState(null); // רמה 1: קבוצה אחת פתוחה
  const [openEx, setOpenEx] = useState(null); // רמה 3: תרגיל אחד מורחב
  const [form, setForm] = useState(null); // null | EMPTY | תרגיל בעריכה
  const [q, setQ] = useState('');
  useEffect(() => {
    Cloud.refreshMedia(); // רענון תמונות מהמסד בכל פתיחת המאגר
  }, []);
  const query = q.trim().toLowerCase();
  const match = (e) => !query || e.name.toLowerCase().includes(query) || (e.en || '').toLowerCase().includes(query);

  const homeList = list.filter((e) => e.tag === HOME_TAG);
  const rest = list.filter((e) => e.tag !== HOME_TAG);
  const cats = EX_CATS.filter((c) => PANEL_CATS.includes(c.id) || (c.id !== 'cardio' && c.id !== 'pilates' && rest.some((e) => e.cat === c.id)));
  const groups = [...cats.map((c) => ({ id: c.id, label: c.label, items: rest.filter((e) => e.cat === c.id) })), { id: HOME_ID, label: HOME_LABEL, items: homeList }];
  const finish = (cat) => {
    if (cat) setOpenCat(cat);
    setForm(null);
  };
  const edit = (e) => setForm({ id: e.id, name: e.name, cat: e.cat, en: e.en || '', tips: (e.tips || []).join('\n'), tag: e.tag || '', muscle_img_url: e.muscle_img_url || '', movement_img_url: e.movement_img_url || '' });

  return (
    <div className="space-y-3">
      <input className={inputCls + ' mt-0'} type="search" placeholder={g('חפש תרגיל', 'חפשי תרגיל')} aria-label="חיפוש תרגיל" value={q} onChange={(e) => setQ(e.target.value)} />

      {form && !form.id ? (
        <div className="border border-line bg-surf rounded-lg p-3 space-y-3">
          <div className="text-sm font-bold">תרגיל חדש</div>
          <ExerciseForm user={user} init={{ ...form, cat: openCat && PANEL_CATS.includes(openCat) ? openCat : form.cat, tag: openCat === HOME_ID ? HOME_TAG : form.tag }} onDone={finish} />
        </div>
      ) : (
        <button onClick={() => setForm(EMPTY)} className="w-full rounded-lg border border-line bg-surf py-2.5 font-bold text-sm">
          + תרגיל חדש למאגר
        </button>
      )}

      <div className="space-y-2">
        {groups.map((c) => {
          const items = c.items.filter(match);
          if (query && !items.length) return null;
          return (
            <AccordionItem key={c.id} title={c.label} meta={String(items.length)} open={!!query || openCat === c.id} onToggle={() => setOpenCat(openCat === c.id ? null : c.id)}>
              <ul className="divide-y divide-line">
                {items.length ? (
                  items.map((e) => {
                    const open = openEx === e.id;
                    return (
                      <li key={e.id}>
                        <button type="button" aria-expanded={open} onClick={() => setOpenEx(open ? null : e.id)} className="w-full flex justify-between items-center gap-3 px-4 py-3 text-right text-sm font-bold">
                          <span className="min-w-0">{e.name}</span>
                          <span className="text-mute font-medium shrink-0">{open ? '▴' : '▾'}</span>
                        </button>
                        {open ? (
                          form && form.id === e.id ? (
                            <div className="px-3 pb-3">
                              <ExerciseForm user={user} init={form} onDone={finish} />
                            </div>
                          ) : (
                            <ExerciseCard user={user} today={today} e={e} onAdd={onAdd} onEdit={edit} />
                          )
                        ) : null}
                      </li>
                    );
                  })
                ) : (
                  <li className="px-4 py-3 text-sm text-mute">אין תרגילים בקטגוריה</li>
                )}
              </ul>
            </AccordionItem>
          );
        })}
      </div>
    </div>
  );
}
