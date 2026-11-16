import { useMemo } from 'react';
import { useStoreVersion } from '../lib/store.js';
import { fmtLog, hasData, logsOf } from '../lib/workouts.js';
import { fmtDay } from '../lib/utils.js';

/* היסטוריית אימונים לפי יום (30 הימים האחרונים עם נתונים) */
export default function WorkoutHistory({ user }) {
  const ver = useStoreVersion();
  const days = useMemo(() => {
    const map = {};
    logsOf(user).forEach((w) => {
      if (hasData(w)) (map[w.date] = map[w.date] || []).push(w);
    });
    return Object.keys(map)
      .sort()
      .reverse()
      .slice(0, 30)
      .map((d) => ({ date: d, items: map[d].sort((a, b) => (a.time || '').localeCompare(b.time || '')) }));
  }, [ver, user]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!days.length) return <p className="text-sm text-mute px-4 py-3">עוד אין אימונים מתועדים.</p>;
  return (
    <div className="divide-y divide-line">
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
  );
}
