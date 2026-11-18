import { useRef, useState } from 'react';
import { OVER } from '../lib/config.js';
import { Cloud, genSyncKey, useCloud } from '../lib/supabaseClient.js';
import { Store } from '../lib/store.js';
import { copyText, todayKey } from '../lib/utils.js';
import { Field, btnPrimary, inputCls } from './ui.jsx';
import SQL_SETUP from '../../supabase/setup.sql?raw';

const STATE_TEXT = {
  off: 'לא מחובר',
  syncing: 'מסנכרן…',
  ok: 'מסונכרן',
  error: 'שגיאת סנכרון',
  offline: 'אין חיבור. הנתונים נשמרים מקומית',
};
export const stateText = (s) => STATE_TEXT[s];
export const stateColor = (s) => ({ off: '#6B7280', syncing: '#FBBF24', ok: '#4ADE80', error: OVER, offline: '#FBBF24' })[s];

export default function CloudPanel() {
  const st = useCloud();
  const saved = Cloud.config();
  const env = Cloud.envDefaults();
  const [f, setF] = useState(saved);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState('');
  const fileRef = useRef(null);
  const hasUrl = f.url.trim() || env.url;
  const hasKey = f.key.trim() || env.key;
  const ready = hasUrl && hasKey && f.sync.trim().length >= 16;

  const flash = (k) => {
    setCopied(k);
    setTimeout(() => setCopied(''), 1500);
  };
  const download = () => {
    const blob = new Blob([JSON.stringify(Store.exportAll())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nutri-backup-' + todayKey() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const onFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setNote('שוחזרו ' + Store.importAll(JSON.parse(reader.result)) + ' פריטים');
      } catch (err) {
        setNote('שחזור נכשל: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm" role="status">
        <span className="inline-block rounded-full" style={{ width: 9, height: 9, background: stateColor(st.state) }} />
        <b>{STATE_TEXT[st.state]}</b>
        {st.state === 'ok' && st.at ? (
          <span className="text-mute tnum">· {new Date(st.at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
        ) : null}
      </div>
      {st.msg ? (
        <p className="text-xs break-words" style={{ color: OVER }} dir="ltr">
          {st.msg}
        </p>
      ) : null}

      <Field label="Project URL">
        <input className={inputCls} type="url" dir="ltr" placeholder={env.url || 'https://xxxx.supabase.co'} value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
      </Field>
      <Field label="Publishable key">
        <input className={inputCls} type="password" autoComplete="off" dir="ltr" placeholder={env.key ? '(מוגדר במשתני הסביבה)' : 'sb_publishable_…'} value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} />
      </Field>
      <Field label="מפתח סנכרון (סוד משותף למכשירים שלך)">
        <input className={inputCls} type="text" dir="ltr" autoComplete="off" value={f.sync} onChange={(e) => setF({ ...f, sync: e.target.value })} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setF({ ...f, sync: genSyncKey() })} className="rounded-md border border-line px-3 py-2 text-sm font-bold">
          צור מפתח חדש
        </button>
        <button onClick={() => copyText(f.sync).then(() => flash('key'))} disabled={!f.sync} className="rounded-md border border-line px-3 py-2 text-sm font-bold disabled:opacity-40">
          {copied === 'key' ? 'הועתק ✓' : 'העתק מפתח'}
        </button>
      </div>
      <p className="text-xs text-mute leading-relaxed">
        כדי לחבר מכשיר נוסף, הזינו בו את אותו מפתח סנכרון (ואת הכתובת והמפתח הציבורי, אם הם לא מוגדרים במשתני הסביבה). מי שמחזיק במפתח הסנכרון יכול לקרוא ולכתוב את הנתונים שלכם, לכן שמרו אותו פרטי.
      </p>
      <div className="flex gap-2">
        <button onClick={() => Cloud.configure(f)} disabled={!ready} className={'flex-1 rounded-md py-3 font-bold disabled:opacity-40 ' + btnPrimary}>
          שמור וסנכרן
        </button>
        <button onClick={() => Cloud.sync()} disabled={!Cloud.enabled()} className="rounded-md border border-line px-4 font-bold disabled:opacity-40">
          סנכרן עכשיו
        </button>
      </div>
      {Cloud.enabled() ? (
        <button
          onClick={() => {
            Cloud.disconnect();
            setF({ url: '', key: '', sync: '' });
          }}
          className="text-sm font-bold underline"
          style={{ color: OVER }}
        >
          נתק מהענן (הנתונים המקומיים נשארים)
        </button>
      ) : null}

      <details className="rounded-lg border border-line bg-surf">
        <summary className="px-4 py-3 font-bold text-sm cursor-pointer">הקמה חד־פעמית של Supabase</summary>
        <div className="px-4 pb-4 space-y-2">
          <ol className="text-xs text-mute leading-relaxed list-decimal pr-4 space-y-1">
            <li>צרו פרויקט בשירות Supabase, והעתיקו את כתובת הפרויקט ואת המפתח הציבורי מהגדרות הפרויקט.</li>
            <li>פתחו את עורך ה־SQL של הפרויקט, הדביקו את הסקריפט שלמטה והריצו אותו.</li>
            <li>חזרו לכאן, צרו מפתח סנכרון ולחצו ״שמור וסנכרן״.</li>
          </ol>
          <button onClick={() => copyText(SQL_SETUP).then(() => flash('sql'))} className="rounded-md border border-line px-3 py-2 text-sm font-bold">
            {copied === 'sql' ? 'הועתק ✓' : 'העתק את סקריפט ה-SQL'}
          </button>
          <textarea readOnly rows="8" dir="ltr" value={SQL_SETUP} className="w-full rounded-md p-2 text-[11px] text-ink font-mono" style={{ resize: 'none' }} aria-label="סקריפט SQL" />
        </div>
      </details>

      <div className="border-t border-line pt-4 space-y-2">
        <h3 className="font-bold text-sm">גיבוי לקובץ</h3>
        <div className="flex gap-2">
          <button onClick={download} className="rounded-md border border-line px-3 py-2 text-sm font-bold">
            הורד גיבוי
          </button>
          <button onClick={() => fileRef.current && fileRef.current.click()} className="rounded-md border border-line px-3 py-2 text-sm font-bold">
            שחזר מקובץ
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
        </div>
        {note ? (
          <p className="text-xs text-mute" role="status">
            {note}
          </p>
        ) : null}
      </div>
    </div>
  );
}
