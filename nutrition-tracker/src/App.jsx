import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_MODEL, PROFILES } from './lib/config.js';
import { Fem } from './lib/gender.js';
import { Store, useStoreVersion } from './lib/store.js';
import { Cloud, useCloud } from './lib/supabaseClient.js';
import { LS, fmtDay, sumM, todayKey } from './lib/utils.js';
import ChatInput from './components/ChatInput.jsx';
import { stateColor, stateText } from './components/CloudPanel.jsx';
import FoodAdvisor from './components/FoodAdvisor.jsx';
import History from './components/History.jsx';
import Metrics from './components/Metrics.jsx';
import ProgressBars from './components/ProgressBars.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import { IconGear, chipOn } from './components/ui.jsx';

/* התאריך מתעדכן אוטומטית גם אם האפליקציה נשארת פתוחה אחרי חצות */
function useToday() {
  const [day, setDay] = useState(todayKey());
  useEffect(() => {
    const tick = () => setDay(todayKey());
    const id = setInterval(tick, 30000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return day;
}

function SyncDot({ onClick }) {
  const st = useCloud();
  const pending = st.state === 'ok' && Store.hasDirty();
  return (
    <button onClick={onClick} aria-label={'סטטוס סנכרון: ' + stateText(st.state)} title={stateText(st.state)} className="w-9 h-9 rounded-md border border-line flex items-center justify-center">
      <span className="rounded-full" style={{ width: 9, height: 9, background: pending ? '#FBBF24' : st.state === 'off' ? '#4B5563' : stateColor(st.state) }} />
    </button>
  );
}

function Today({ user, today, msgs, setMsgs, aiCfg }) {
  const ver = useStoreVersion();
  const entries = useMemo(() => Store.list('log', user).filter((e) => e.date === today), [ver, user, today]);
  const totals = useMemo(() => sumM(entries), [entries]);
  const day = useMemo(() => Store.get('day', user, today) || { date: today, water: 0, steps: 0, wk: false }, [ver, user, today]);
  return (
    <section className="px-4 space-y-3">
      <ProgressBars user={user} today={today} totals={totals} day={day} />
      <FoodAdvisor user={user} totals={totals} weekend={!!day.wk} entries={entries} aiCfg={aiCfg} />
      <ChatInput user={user} today={today} msgs={msgs} setMsgs={setMsgs} aiCfg={aiCfg} />
    </section>
  );
}

const TITLES = { today: 'היום', history: 'היסטוריה', metrics: 'מדדים' };

export default function App() {
  const [user, setUser] = useState(() => {
    const u = LS.get('nt2:user', 'nir');
    return PROFILES[u] ? u : 'nir';
  });
  useEffect(() => {
    LS.set('nt2:user', user);
  }, [user]);

  const [tab, setTab] = useState('today');
  const [settings, setSettings] = useState(null); // null | 'foods' | 'ai' | 'cloud'
  const [aiCfg, setAiCfgState] = useState(() => LS.get('nt2:ai', { key: '', model: DEFAULT_MODEL }));
  const setAiCfg = (c) => {
    setAiCfgState(c);
    LS.set('nt2:ai', c);
  };
  const [chats, setChats] = useState({ nir: [], od: [] });
  const setMsgs = (fn) => setChats((c) => ({ ...c, [user]: typeof fn === 'function' ? fn(c[user]) : fn }));

  const today = useToday();
  const scroller = useRef(null);
  const go = (id) => {
    setTab(id);
    if (scroller.current) scroller.current.scrollTop = 0;
  };

  return (
    <Fem.Provider value={!!PROFILES[user].fem}>
      <div className="shell flex flex-col">
        <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
          <div className="max-w-md mx-auto pb-6">
            <header className="px-4 pt-5 pb-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h1 className="text-lg font-extrabold tracking-tight leading-tight">{TITLES[tab]}</h1>
                <p className="text-xs text-mute truncate">{fmtDay(today)}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="flex rounded-md border border-line bg-surf p-0.5 text-sm" role="tablist" aria-label="בחירת משתמש">
                  {Object.keys(PROFILES).map((id) => (
                    <button key={id} role="tab" aria-selected={user === id} onClick={() => setUser(id)} className={'rounded px-3 py-1.5 font-bold ' + (user === id ? chipOn : 'text-ink')}>
                      {PROFILES[id].name}
                    </button>
                  ))}
                </div>
                <SyncDot onClick={() => setSettings('cloud')} />
                <button onClick={() => setSettings('foods')} aria-label="הגדרות" className="w-9 h-9 rounded-md border border-line flex items-center justify-center">
                  <IconGear />
                </button>
              </div>
            </header>
            {tab === 'today' && <Today key={user} user={user} today={today} msgs={chats[user]} setMsgs={setMsgs} aiCfg={aiCfg} />}
            {tab === 'history' && <History key={user} user={user} today={today} />}
            {tab === 'metrics' && <Metrics key={user} user={user} />}
          </div>
        </div>
        <nav
          className="shrink-0 mx-auto rounded-lg border border-line bg-surf overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,.4)]"
          style={{ marginBottom: 'calc(var(--nav-bottom) + env(safe-area-inset-bottom, 0px))', width: 'calc(100% - 1.5rem)', maxWidth: '28rem' }}
        >
          <div className="flex">
            {Object.keys(TITLES).map((id) => (
              <button
                key={id}
                onClick={() => go(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={'flex-1 py-3.5 font-bold text-sm border-t-2 ' + (tab === id ? 'text-brand border-brand' : 'text-mute border-transparent')}
              >
                {TITLES[id]}
              </button>
            ))}
          </div>
        </nav>
      </div>
      {settings && <SettingsModal user={user} tab={settings} setTab={setSettings} aiCfg={aiCfg} setAiCfg={setAiCfg} onClose={() => setSettings(null)} />}
    </Fem.Provider>
  );
}
