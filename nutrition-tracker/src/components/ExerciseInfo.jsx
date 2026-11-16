import { useEffect, useState } from 'react';
import { catLabel } from '../lib/workouts.js';

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
      <div role="dialog" aria-modal="true" aria-label={ex.name} className="w-full max-w-sm max-h-[90dvh] overflow-y-auto bg-bg border border-line rounded-xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
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
        <div className="grid grid-cols-2 gap-2.5">
          <ImageSlot url={ex.muscle_img_url} label="אנטומיה (שריר)" icon="muscle" />
          <ImageSlot url={ex.movement_img_url} label="תנועה" icon="move" />
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
