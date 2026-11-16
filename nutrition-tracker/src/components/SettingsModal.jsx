import { DEFAULT_MODEL, OVER } from '../lib/config.js';
import CloudPanel from './CloudPanel.jsx';
import FoodsPanel from './FoodsPanel.jsx';
import { Field, Modal, Switch, chipOn, inputCls } from './ui.jsx';

function AiPanel({ cfg, setCfg }) {
  const on = !!(cfg.key && cfg.key.trim());
  return (
    <div className="space-y-3">
      <p className="text-sm text-mute leading-relaxed">
        ללא מפתח, הצ׳אט מנתח את הטקסט בעצמו לפי המאגר וטבלת הערכות. עם מפתח API של Anthropic, מודל מנתח כל משפט, מעריך ערכים, מתקן רשומות שכבר נרשמו היום, ומפעיל את ״מה לאכול עכשיו?״.
      </p>
      <Field label="מפתח API של Anthropic">
        <input className={inputCls} type="password" autoComplete="off" dir="ltr" placeholder="sk-ant-…" value={cfg.key || ''} onChange={(e) => setCfg({ ...cfg, key: e.target.value })} />
      </Field>
      <Field label="מודל">
        <input className={inputCls} type="text" dir="ltr" value={cfg.model || DEFAULT_MODEL} onChange={(e) => setCfg({ ...cfg, model: e.target.value })} />
      </Field>
      <p className="text-xs text-mute leading-relaxed">
        המפתח נשמר רק בדפדפן הזה. הוא לא מסונכרן לענן ולא כלול בגיבוי. כל ניתוח נשלח ישירות ל-Anthropic ועולה סכום קטן, ומומלץ להגדיר מגבלת הוצאה למפתח.
      </p>
      {on ? (
        <button onClick={() => setCfg({ ...cfg, key: '' })} className="text-sm font-bold underline" style={{ color: OVER }}>
          הסרת המפתח
        </button>
      ) : null}
    </div>
  );
}

const TABS = [
  ['foods', 'מאגר מזון'],
  ['ai', 'AI'],
  ['cloud', 'ענן'],
];

/* כל ההגדרות במקום אחד, ונפתחות רק מאייקון ההגדרות */
export default function SettingsModal({ user, theme, setTheme, tab, setTab, aiCfg, setAiCfg, onClose }) {
  return (
    <Modal title="הגדרות" onClose={onClose}>
      <div className="flex items-center justify-between border border-line bg-surf rounded-md px-3 py-2.5 mb-3">
        <span className="text-sm font-bold">מצב בהיר</span>
        <Switch on={theme === 'light'} onChange={(v) => setTheme(v ? 'light' : 'dark')} label="מצב בהיר" />
      </div>
      <div className="grid grid-cols-3 rounded-md border border-line bg-surf p-1 mb-4" role="tablist" aria-label="הגדרות">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={'rounded py-2 font-bold text-sm ' + (tab === id ? chipOn : 'text-ink')}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'foods' ? <FoodsPanel user={user} /> : tab === 'ai' ? <AiPanel cfg={aiCfg} setCfg={setAiCfg} /> : <CloudPanel />}
    </Modal>
  );
}
