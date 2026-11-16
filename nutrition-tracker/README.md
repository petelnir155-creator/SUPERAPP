# מעקב תזונה

React + Vite + Tailwind, עם סנכרון ל-Supabase. הנתונים נשמרים תמיד גם מקומית בדפדפן.

## הרצה מקומית

```bash
npm install
npm run dev
```

## פריסה ב-Vercel

1. דחפו את התיקייה ל-GitHub.
2. ב-Vercel: Add New Project ← בחרו את המאגר. הגדרות Vite מזוהות אוטומטית (`npm run build`, תיקיית פלט `dist`).
3. אופציונלי: הגדירו `VITE_SUPABASE_URL` ו-`VITE_SUPABASE_KEY` ב-Environment Variables. אפשר גם להזין אותם באפליקציה (⚙ ← ענן).

## חיבור Supabase

1. צרו פרויקט, ובעורך ה-SQL הריצו את `supabase/setup.sql` פעם אחת.
2. באפליקציה: ⚙ ← ענן ← צרו מפתח סנכרון ולחצו "שמור וסנכרן". באותו אופן מחברים מכשיר נוסף.

## מעבר מהגרסה הקודמת (קובץ HTML יחיד)

בגרסה הישנה: ⚙ ← ענן ← "הורד גיבוי". בגרסה החדשה: ⚙ ← ענן ← "שחזר מקובץ".

## מבנה

- `src/lib` לוגיקה: חנות נתונים (`store.js`), מנתח מקומי (`parser.js`), קריאות ל-Claude (`ai.js`), פעולות (`actions.js`), סנכרון (`supabaseClient.js`).
- `src/components` ממשק.
- `supabase/setup.sql` טבלה סגורה ושתי פונקציות RPC.

מפתח ה-API של Anthropic נשמר בדפדפן בלבד ואינו מסונכרן.
