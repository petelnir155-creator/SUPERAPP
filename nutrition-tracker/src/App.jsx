import { useEffect, useMemo, useRef, useState } from 'react';
import { APP_NAME, DEFAULT_MODEL, PROFILES } from './lib/config.js';
import { Fem } from './lib/gender.js';
import { Store, useStoreVersion } from './lib/store.js';
import { Cloud, useCloud } from './lib/supabaseClient.js';
import { applyTheme, getTheme, saveTheme } from './lib/theme.js';
import { LS, fmtDay, sumM, todayKey } from './lib/utils.js';
import ChatInput from './components/ChatInput.jsx';
import { stateColor, stateText } from './components/CloudPanel.jsx';
import FoodAdvisor from './components/FoodAdvisor.jsx';
import History from './components/History.jsx';
import ProgressBars from './components/ProgressBars.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import Workouts from './components/Workouts.jsx';
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
    <section className="flex-1 flex flex-col gap-3 px-4">
      <ProgressBars user={user} today={today} totals={totals} day={day} />
      {/* אזור ה-AI צמוד לתחתית, האלמנט האחרון לפני הניווט */}
      <div className="mt-auto pt-2 flex flex-col gap-2">
        <ChatInput user={user} today={today} msgs={msgs} setMsgs={setMsgs} aiCfg={aiCfg} />
        <FoodAdvisor user={user} totals={totals} weekend={!!day.wk} entries={entries} aiCfg={aiCfg} />
      </div>
    </section>
  );
}

const TITLES = { today: 'תזונה', workouts: 'אימונים', history: 'היסטוריה' };

export default function App() {
  const [user, setUser] = useState(() => {
    const u = LS.get('nt2:user', 'nir');
    return PROFILES[u] ? u : 'nir';
  });
  useEffect(() => {
    LS.set('nt2:user', user);
  }, [user]);

  const [theme, setThemeState] = useState(getTheme);
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  const setTheme = (t) => {
    setThemeState(t);
    saveTheme(t);
  };

  const [tab, setTab] = useState('today');
  const [settings, setSettings] = useState(null); // null | 'foods' | 'ai' | 'cloud'
  const [aiCfg, setAiCfgState] = useState(() => LS.get('nt2:ai', { key: '', model: DEFAULT_MODEL }));
  const setAiCfg = (c) => {
    setAiCfgState(c);
    LS.set('nt2:ai', c);
  };
  const [chats, setChats] = useState({ nir: [], od: [] });
  const setMsgs = (fn) => setChats((c) => ({ ...c, [user]: typeof fn === 'function' ? fn(c[user]) : fn }));
  const [wchats, setWchats] = useState({ nir: [], od: [] });
  const setWmsgs = (fn) => setWchats((c) => ({ ...c, [user]: typeof fn === 'function' ? fn(c[user]) : fn }));

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
          <div className="max-w-md mx-auto min-h-full flex flex-col pb-3">
            <header className="px-4 pt-5 pb-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h1 className="text-lg font-extrabold tracking-tight leading-tight">{APP_NAME}</h1>
                <p className="text-xs text-mute truncate">
                  {TITLES[tab]} · {fmtDay(today)}
                </p>
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
            {tab === 'workouts' && (
              <Workouts key={user} user={user} today={today} msgs={wchats[user]} setMsgs={setWmsgs} aiCfg={aiCfg} onOpenExercises={() => setSettings('exercises')} />
            )}
            {tab === 'history' && <History key={user} user={user} today={today} />}
          </div>
        </div>
        <nav
          className="shrink-0 mx-auto rounded-lg border border-line bg-surf overflow-hidden nav-shadow"
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
      {settings && <SettingsModal user={user} theme={theme} setTheme={setTheme} tab={settings} setTab={setSettings} aiCfg={aiCfg} setAiCfg={setAiCfg} onClose={() => setSettings(null)} />}
    </Fem.Provider>
  );
}
