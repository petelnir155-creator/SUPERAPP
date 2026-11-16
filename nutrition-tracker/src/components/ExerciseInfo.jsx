import { useEffect } from 'react';
import { catLabel } from '../lib/workouts.js';

/* חלון מידע ("Pro Tips") לתרגיל: שם, קבוצת שריר ודגשים טכניים */
export function ExerciseInfo({ ex, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation(); // לא לסגור גם את החלון שמתחת
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const tips = ex.tips || [];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 px-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={ex.name} className="w-full max-w-sm bg-bg border border-line rounded-xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg leading-snug">{ex.name}</h2>
            {ex.en ? (
              <div dir="ltr" className="text-sm text-mute text-right">
                {ex.en}
              </div>
            ) : null}
            <div className="text-xs text-mute mt-1">{catLabel(ex.cat)}</div>
          </div>
          <button autoFocus onClick={onClose} aria-label="סגור" className="w-9 h-9 rounded-md border border-line text-xl leading-none shrink-0">
            ×
          </button>
        </div>
        {tips.length ? (
          <ul className="space-y-2">
            {tips.map((t, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed">
                <span className="text-brand shrink-0" aria-hidden="true">•</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-mute">אין דגשים לתרגיל. אפשר להוסיף במאגר התרגילים, בעריכת התרגיל.</div>
        )}
      </div>
    </div>
  );
}

/* כפתור ⓘ קטן שפותח את החלון */
export function InfoButton({ onClick, name }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={'דגשים: ' + name}
      className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-line text-[13px] leading-none text-mute align-middle shrink-0"
    >
      i
    </button>
  );
}
