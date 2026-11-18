-- Optional. Run once in Supabase: SQL Editor > New query > Run.
-- Requires setup.sql to have been run first.
--
-- The app keeps working with the single table nt_rows. This script adds relational tables that are
-- filled automatically from it (a mirror, read only from the dashboard), so workouts, exercises and
-- teaching shifts can be queried, filtered and charted with normal SQL:
--   exercise_db   - the exercise library
--   workout_logs  - one row per exercise per day
--   work_shifts   - work shifts: hours, hourly rate, notes, amount
-- Never write to these tables by hand: the app overwrites them from nt_rows.

create table if not exists public.exercise_db (
  sync_key     text    not null,
  id           text    not null,
  usr          text    not null,
  name         text    not null,
  name_en      text,
  muscle_group text,
  workout_type text    not null default 'strength',  -- strength | machine | run | pilates
  tips         jsonb   not null default '[]'::jsonb,   -- technical pro tips, a JSON array of strings
  tag          text,                                    -- extra group, for example home6 = home workout (6 kg)
  muscle_img_url   text,                                -- anatomy image (URL), optional
  movement_img_url text,                                -- movement image (URL), optional
  auto_created boolean not null default false,
  updated_ts   bigint  not null,
  primary key (sync_key, id)
);

create table if not exists public.workout_logs (
  sync_key         text    not null,
  id               text    not null,
  usr              text    not null,
  log_date         date    not null,
  logged_time      text,
  exercise_id      text,
  exercise_name    text    not null,
  workout_type     text    not null default 'strength',
  muscle_group     text,
  sets             jsonb   not null default '[]'::jsonb,
  total_sets       integer not null default 0,
  total_reps       integer not null default 0,
  volume_kg        numeric not null default 0,
  duration_minutes numeric,
  speed_kmh        numeric,
  distance_km      numeric,
  updated_ts       bigint  not null,
  primary key (sync_key, id)
);

create table if not exists public.work_shifts (
  sync_key   text    not null,
  id         text    not null,
  usr        text    not null,
  shift_date date    not null,
  minutes    integer not null,
  hours      numeric generated always as (round(minutes / 60.0, 2)) stored,
  hourly_rate numeric,                                  -- ILS per hour, optional
  notes      text,                                      -- free text, optional
  total_amount numeric generated always as (round(minutes / 60.0 * coalesce(hourly_rate, 0), 2)) stored,
  updated_ts bigint  not null,
  primary key (sync_key, id)
);

-- If you created similar tables by hand earlier, make sure the columns exist.
alter table public.exercise_db  add column if not exists muscle_group text;
alter table public.exercise_db  add column if not exists name_en text;
alter table public.exercise_db  add column if not exists tips jsonb not null default '[]'::jsonb;
alter table public.exercise_db  add column if not exists tag text;
alter table public.exercise_db  add column if not exists muscle_img_url text;
alter table public.exercise_db  add column if not exists movement_img_url text;
alter table public.work_shifts  add column if not exists hourly_rate numeric;
alter table public.work_shifts  add column if not exists notes text;
alter table public.work_shifts  add column if not exists total_amount numeric generated always as (round(minutes / 60.0 * coalesce(hourly_rate, 0), 2)) stored;
alter table public.workout_logs add column if not exists muscle_group text;
alter table public.workout_logs add column if not exists duration_minutes numeric;
alter table public.workout_logs add column if not exists speed_kmh numeric;
alter table public.workout_logs add column if not exists distance_km numeric;

create index if not exists workout_logs_day  on public.workout_logs (sync_key, usr, log_date);
create index if not exists work_shifts_day   on public.work_shifts  (sync_key, usr, shift_date);

-- Closed to the public API: only the dashboard / service role can read them.
alter table public.exercise_db  enable row level security;
alter table public.workout_logs enable row level security;
alter table public.work_shifts  enable row level security;
revoke all on public.exercise_db, public.workout_logs, public.work_shifts from anon, authenticated;

-- Copies one document into the matching table. It never raises: a malformed document must not break syncing.
create or replace function public.nt_mirror_row(r public.nt_rows)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_type text;
  v_min  numeric;
begin
  if r.kind = 'ex' then
    if r.del then
      delete from public.exercise_db where sync_key = r.sync_key and id = r.id;
    else
      insert into public.exercise_db (sync_key, id, usr, name, name_en, muscle_group, workout_type, tips, tag, muscle_img_url, movement_img_url, auto_created, updated_ts)
      values (r.sync_key, r.id, r.usr, coalesce(r.d->>'name', ''), r.d->>'en', r.d->>'cat',
              coalesce(r.d->>'type', case r.d->>'cat' when 'cardio' then 'machine' when 'pilates' then 'pilates' else 'strength' end),
              case when jsonb_typeof(r.d->'tips') = 'array' then r.d->'tips' else '[]'::jsonb end,
              nullif(r.d->>'tag', ''), nullif(r.d->>'muscle_img_url', ''), nullif(r.d->>'movement_img_url', ''),
              coalesce((r.d->>'auto')::boolean, false), r.ts)
      on conflict (sync_key, id) do update
        set usr = excluded.usr, name = excluded.name, name_en = excluded.name_en, muscle_group = excluded.muscle_group,
            workout_type = excluded.workout_type, tips = excluded.tips, tag = excluded.tag,
            -- image URLs may be set directly in exercise_db; an exercise edit in the app must not wipe them
            muscle_img_url = coalesce(excluded.muscle_img_url, public.exercise_db.muscle_img_url),
            movement_img_url = coalesce(excluded.movement_img_url, public.exercise_db.movement_img_url), auto_created = excluded.auto_created, updated_ts = excluded.updated_ts;
    end if;

  elsif r.kind = 'wk' then
    if r.del then
      delete from public.workout_logs where sync_key = r.sync_key and id = r.id;
    else
      v_type := coalesce(r.d->>'type', case r.d->>'cat' when 'cardio' then 'machine' when 'pilates' then 'pilates' else 'strength' end);
      -- old cardio documents kept the minutes inside "sets"
      v_min := coalesce((r.d->>'minutes')::numeric,
                        case when v_type <> 'strength' then (select sum((s->>'reps')::numeric) from jsonb_array_elements(coalesce(r.d->'sets', '[]'::jsonb)) s) end);
      insert into public.workout_logs (sync_key, id, usr, log_date, logged_time, exercise_id, exercise_name, workout_type, muscle_group,
                                       sets, total_sets, total_reps, volume_kg, duration_minutes, speed_kmh, distance_km, updated_ts)
      values (r.sync_key, r.id, r.usr, (r.d->>'date')::date, r.d->>'time', r.d->>'exId', coalesce(r.d->>'name', ''), v_type,
              case when v_type = 'strength' then r.d->>'cat' end,
              case when v_type = 'strength' then coalesce(r.d->'sets', '[]'::jsonb) else '[]'::jsonb end,
              case when v_type = 'strength' then jsonb_array_length(coalesce(r.d->'sets', '[]'::jsonb)) else 0 end,
              case when v_type = 'strength' then coalesce((select sum((s->>'reps')::numeric) from jsonb_array_elements(coalesce(r.d->'sets', '[]'::jsonb)) s), 0) else 0 end,
              case when v_type = 'strength' then coalesce((select sum((s->>'reps')::numeric * (s->>'kg')::numeric) from jsonb_array_elements(coalesce(r.d->'sets', '[]'::jsonb)) s), 0) else 0 end,
              nullif(v_min, 0),
              nullif((r.d->>'speed')::numeric, 0),
              nullif((r.d->>'km')::numeric, 0),
              r.ts)
      on conflict (sync_key, id) do update
        set usr = excluded.usr, log_date = excluded.log_date, logged_time = excluded.logged_time, exercise_id = excluded.exercise_id,
            exercise_name = excluded.exercise_name, workout_type = excluded.workout_type, muscle_group = excluded.muscle_group,
            sets = excluded.sets, total_sets = excluded.total_sets, total_reps = excluded.total_reps, volume_kg = excluded.volume_kg,
            duration_minutes = excluded.duration_minutes, speed_kmh = excluded.speed_kmh, distance_km = excluded.distance_km,
            updated_ts = excluded.updated_ts;
    end if;

  elsif r.kind = 'shift' then
    if r.del then
      delete from public.work_shifts where sync_key = r.sync_key and id = r.id;
    else
      insert into public.work_shifts (sync_key, id, usr, shift_date, minutes, hourly_rate, notes, updated_ts)
      values (r.sync_key, r.id, r.usr, (r.d->>'date')::date, (r.d->>'minutes')::integer,
              nullif((r.d->>'rate')::numeric, 0), nullif(r.d->>'note', ''), r.ts)
      on conflict (sync_key, id) do update
        set usr = excluded.usr, shift_date = excluded.shift_date, minutes = excluded.minutes,
            hourly_rate = excluded.hourly_rate, notes = excluded.notes, updated_ts = excluded.updated_ts;
    end if;
  end if;
exception when others then
  raise warning 'nt_mirror_row skipped %: %', r.id, sqlerrm;
end $$;

create or replace function public.nt_mirror_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.nt_mirror_row(new);
  return null;
end $$;

-- The app reads exercise images from exercise_db through this function (the table itself stays closed to anon).
create or replace function public.nt_exercise_media(p_key text)
returns table (id text, usr text, muscle_img_url text, movement_img_url text)
language plpgsql security definer set search_path = public as $$
begin
  if length(coalesce(p_key, '')) < 16 then raise exception 'bad sync key'; end if;
  return query
    select e.id, e.usr, e.muscle_img_url, e.movement_img_url
    from public.exercise_db e
    where e.sync_key = p_key and (e.muscle_img_url is not null or e.movement_img_url is not null);
end $$;
revoke all on function public.nt_exercise_media(text) from public;
grant execute on function public.nt_exercise_media(text) to anon, authenticated;

drop trigger if exists nt_mirror on public.nt_rows;
create trigger nt_mirror after insert or update on public.nt_rows
  for each row execute function public.nt_mirror_trg();

revoke all on function public.nt_mirror_row(public.nt_rows) from public, anon, authenticated;
revoke all on function public.nt_mirror_trg() from public, anon, authenticated;

-- One-time copy of what is already stored.
select public.nt_mirror_row(t) from public.nt_rows t where t.kind in ('ex', 'wk', 'shift');

-- ---------------------------------------------------------------------------------------------
-- Base exercise library with technical tips (Pro Tips), loaded for both users (nir and od).
-- 1. Replace the text below with your sync key (the app: Settings > Cloud > sync key), then Run.
-- 2. The rows are written as documents, so the app receives them on its next sync and exercise_db is
--    filled by the trigger above. Exercises you already edited in the app (newer) are never overwritten.
-- Safe to run again.
-- ---------------------------------------------------------------------------------------------
do $seed$
declare
  v_key text := 'PASTE-YOUR-SYNC-KEY-HERE';
  v_usr text;
begin
  if length(v_key) < 16 or v_key like 'PASTE-%' then
    raise exception 'Replace PASTE-YOUR-SYNC-KEY-HERE with your sync key (Settings > Cloud), then run again.';
  end if;
  foreach v_usr in array array['nir', 'od'] loop
    insert into public.nt_rows (sync_key, id, kind, usr, ts, del, d)
    select v_key, 'ex:' || v_usr || ':' || s.id, 'ex', v_usr, 2, false, s.d
    from (values
    ('p01', '{"id":"p01","cat":"chest","name":"לחיצת חזה במכשיר","en":"Chest Press Machine","tips":["גובה מושב: לכוון שהידיות יהיו בקו אמצע-תחתון של החזה.","שכמות משוכות לאחור ולמטה, חזה מובלט, גב עליון וישבן צמודים למשענת.","כפות רגליים נטועות חזק ברצפה כדי לתת קונטרה לדחיפה.","דחיפה (נשיפה): לדחוף את הידיות קדימה בתנועה חזקה ורציפה.","לא לנעול מרפקים לחלוטין בסוף הדחיפה.","חזרה (שאיפה): להחזיר את המשקל לאט עד שמרגישים מתיחה בחזה.","לוודא שהמרפקים לא בורחים לגובה כתף, אלא נשארים מעט נמוכים מהכתפיים."]}'::jsonb),
    ('p02', '{"id":"p02","cat":"chest","name":"מכשיר לחיצה בשיפוע חיובי","en":"Incline Press Machine","tips":["גובה מושב: הידיות צריכות להיות בקו החזה העליון (ממש מתחת לעצם הבריח).","יציבה: להדק שכמות לספסל, חזה מובלט, קשת טבעית קטנה בגב התחתון.","דחיפה (נשיפה): לדחוף למעלה וקדימה בתנועה חזקה.","לא לנעול את המרפקים בסוף הדחיפה.","חזרה (שאיפה): לרדת לאט ובשליטה עד מתיחה מלאה של אזור החזה העליון.","המרפקים צריכים להישאר בזווית של כ-45 מעלות מהגוף (לא בגובה הכתפיים)."]}'::jsonb),
    ('p03', '{"id":"p03","cat":"back","name":"משיכת פולי עליון","en":"Lat Pulldown","tips":["אחיזה: רחבה מעט מהכתפיים. כריות הברכיים מהודקות היטב.","עמדת מוצא: חזה מובלט למעלה, להישען מעט לאחור.","תחילת תנועה: שכמות למטה לפני שמתחילים לכופף את המרפקים.","משיכה (נשיפה): למשוך את המוט לכיוון החזה העליון/עצם הבריח.","לדמיין משיכת המרפקים למטה ולכיוון המותניים (ולא משיכה מהידיים).","חזרה (שאיפה): להחזיר את המוט למעלה לאט ובשליטה.","לתת לשכמות לעלות ולהימתח בסוף התנועה."]}'::jsonb),
    ('p04', '{"id":"p04","cat":"back","name":"חתירה במכשיר ישיבה","en":"Seated Row Machine","tips":["ישיבה זקופה, חזה מובלט קדימה, רגליים יציבות עם כיפוף קל בברכיים.","תחילת התנועה: להרפות שכמות קדימה כדי לקבל מתיחה מלאה של הגב.","משיכה (נשיפה): למשוך את הידיות לכיוון הבטן או המותן.","מרפקים נשארים צמודים לצלעות ונמשכים כמה שיותר אחורה.","לכווץ שכמות אחת לשנייה בשיא התנועה (כאילו לוחצים עיפרון ביניהן).","להקפיד לא להתנדנד אחורה עם הגו (התנועה מגיעה מהגב והשכמה, לא מתנופה).","חזרה (שאיפה): להחזיר לאט קדימה, לתת לשכמות להתרחק ולהימתח מחדש."]}'::jsonb),
    ('p05', '{"id":"p05","cat":"back","name":"פשיטת כתף בכבל בעמידה","en":"Straight-Arm Pulldown","tips":["עמידה מול פולי עליון, רגליים ברוחב הכתפיים, כיפוף קל בברכיים.","אחיזת המוט בשתי ידיים. גו מוטה מעט קדימה, חזה בולט וגב ישר.","מרפקים נשארים עם כיפוף קל וקבוע (לא נעולים לגמרי, ולא מתכופפים במהלך הסט).","משיכה (נשיפה): למשוך את המוט למטה ולכיוון הירכיים בתנועה מעגלית רחבה.","לכווץ את הרחב-גבי (הכנפיים) חזק כשהמוט מגיע לירכיים.","חזרה (שאיפה): להעלות לאט בשליטה חזרה לגובה העיניים עד מתיחה בגב.","התנועה כולה מתבצעת מפרק הכתף בלבד (הידיים נשארות מקובעות)."]}'::jsonb),
    ('p15', '{"id":"p15","cat":"back","name":"משיכת פולי עליון אחיזה צרה","en":"V-Grip Lat Pulldown","tips":["לשבת עם ברכיים מהודקות למכשיר. לאחוז בידית המשולש (V-Grip).","להישען מעט לאחור, להבליט חזה החוצה וכלפי מעלה לאורך כל הסט.","משיכה (נשיפה): למשוך את המשולש לכיוון החזה התחתון.","המרפקים נמשכים קרוב מאוד לגוף ולכיוון הרצפה/מותן.","לכווץ את הרחב-גבי (כנפיים) חזק בשיא התנועה למטה.","חזרה (שאיפה): לתת לידיים לעלות לאט עד ליישור כמעט מלא.","לשחרר שכמות למעלה בסוף העלייה כדי למתוח את השריר היטב."]}'::jsonb),
    ('p06', '{"id":"p06","cat":"back","name":"פשיטת גו בספסל ייעודי","en":"Back Extension","tips":["קצה הכרית מתחת למותניים","ירידה עם גב ישר","עלייה עד קו ישר, בלי הקשתה לאחור"]}'::jsonb),
    ('p07', '{"id":"p07","cat":"shoulders","name":"לחיצת כתפיים במכשיר ישיבה","en":"Shoulder Press Machine","tips":["גובה מושב: לכוון כך שהידיות יהיו בקו גובה הכתף או מעט מתחת.","יציבה: גב צמוד היטב למשענת, חזה מובלט למעלה.","מרפקים צריכים להיות מעט קדימה לקו הגוף (שומר על מפרק הכתף).","דחיפה (נשיפה): לדחוף את הידיות למעלה מעל הראש בתנועה רציפה.","לא לנעול מרפקים בסוף התנועה כדי לשמור על המתח בכתף.","חזרה (שאיפה): לרדת לאט (2-3 שניות) עד שהידיים בגובה האוזניים או מעט למטה.","לא לתת לפלטות לנוח למטה בין חזרות כדי שהמתח יישאר רציף."]}'::jsonb),
    ('p08', '{"id":"p08","cat":"shoulders","name":"הרחקת זרועות בפולי תחתון","en":"Cable Lateral Raises","tips":["פולי תחתון. לעמוד צמוד למכשיר או מעט הצידה, לאחוז בידית עם היד הנגדית.","מומלץ לאחוז בעמוד המכשיר ביד הפנויה ולהישען מעט הצידה לזווית עבודה יציבה.","מרפק היד העובדת עם כיפוף קל וקבוע (לא נעול ולא מתכופף).","הרחקה (נשיפה): להרים את היד הצידה עד לגובה הכתף, לא יותר.","להקפיד שהכתף עצמה (הטרפז) לא עולה לכיוון האוזן, לדכא אותה מטה.","חזרה (שאיפה): לרדת לאט ובהתנגדות (2-3 שניות).","לא לתת ליד העובדת לחצות את קו הגוף פנימה כדי לא לאבד את המתח מהכבל."]}'::jsonb),
    ('p09', '{"id":"p09","cat":"biceps","name":"כפיפת פטישים עם משקולות","en":"Dumbbell Hammer Curls","tips":["עמידה זקופה, חזה מובלט. אחיזה ניטרלית במשקולות (כפות ידיים פונות לירכיים, אחיזת פטיש).","מרפקים מקובעים צמוד לגוף, לא נעים קדימה בעלייה (מבטל עזרה מהכתף).","כפיפה (נשיפה): למשוך את המשקולת לכיוון הכתף הקדמית.","לשמור על אחיזת ה\"פטיש\" (כף יד פונה פנימה) לאורך כל טווח התנועה.","לכווץ את השריר ולעצור לשנייה בשיא התנועה.","חזרה (שאיפה): להוריד את המשקולת לאט ובשליטה עד יישור כמעט מלא.","ניתן לבצע שתי ידיים יחד או יד-יד לסירוגין, כל עוד אין תנופה מהגב."]}'::jsonb),
    ('p10', '{"id":"p10","cat":"biceps","name":"כפיפת מרפקים במוט בפולי תחתון","en":"Cable Bicep Curls","tips":["עמידה יציבה קרוב לפולי תחתון (עם מוט ישר, מוט W או חבל).","יציבה: חזה פתוח, שכמות משוכות לאחור ולמטה, פלג גוף עליון מקובע לחלוטין.","להצמיד מרפקים לצלעות ולקבע אותם, למנוע בריחה שלהם קדימה או אחורה בעלייה.","כפיפה (נשיפה): למשוך את המוט לכיוון הכתף העליונה.","לכווץ את היד הקדמית חזק למשך שנייה בשיא התנועה.","חזרה (שאיפה): להוריד לאט ובשליטה עד ליישור כמעט מלא.","לא לנעול את המרפק בסוף הירידה ולא להתנדנד עם הגב לשם תנופה."]}'::jsonb),
    ('p11', '{"id":"p11","cat":"triceps","name":"פשיטת מרפקים בפולי עליון עם חבל","en":"Tricep Rope Pushdown","tips":["לעמוד קרוב לכבל, רגליים יציבות, כיפוף קל בברכיים.","להטות את הגו מעט קדימה, חזה מובלט קדימה וגב ישר.","להביא את המרפקים לצידי הצלעות ולנעול אותם במקום לאורך כל הסט.","פשיטה (נשיפה): לדחוף את החבל מטה עד ליישור מלא ונעילה של הידיים.","בסוף התנועה לפתוח מעט את החבל הצידה לכיווץ מקסימלי של היד האחורית.","חזרה (שאיפה): להעלות את החבל לאט חזרה.","לעצור כשהאמה עוברת במעט את קו ה-90 מעלות, לא לתת למרפקים להתרומם."]}'::jsonb),
    ('p12', '{"id":"p12","cat":"legs","name":"פשיטת ברכיים במכשיר","en":"Leg Extension","tips":["לכוון את משענת הגב שהברך תמוקם בדיוק בציר הסיבוב של המכשיר.","כרית הרגליים צריכה לשבת על החלק התחתון של השוק.","לאחוז חזק בידיות המכשיר ולמשוך את הישבן לתוך המושב שלא יתרומם.","עלייה (נשיפה): ליישר את הרגליים בתנועה חזקה עד כיווץ מלא של הארבע-ראשי.","סיום עלייה: לעצור לשנייה בשיא הכיווץ (לא לנעול ברך לגמרי אם כואב).","ירידה (שאיפה): לשלוט במשקל ולרדת לאט."]}'::jsonb),
    ('p13', '{"id":"p13","cat":"legs","name":"כפיפת ברכיים במכשיר","en":"Leg Curl","tips":["לכוון את ציר המכשיר במקביל לברך. הכרית התחתונה מעל הקרסול.","כרית הירכיים מהודקת היטב כדי למנוע תזוזה של האגן.","משיכה (נשיפה): לכופף את הברכיים כמה שיותר חזק ועמוק למטה.","לדחוף את האגן חזק לתוך המושב, לא לתת לגב התחתון להתרומם ולהתעגל.","לעצור לשנייה בשיא הכיווץ של הירך האחורית.","חזרה (שאיפה): ליישר את הרגליים לאט ובשליטה.","לא לנעול ברכיים לחלוטין בסוף התנועה חזרה כדי לשמור על מתח."]}'::jsonb),
    ('p14', '{"id":"p14","cat":"legs","name":"דדליפט רומני","en":"RDL","tips":["רגליים ברוחב אגן, כפות רגליים קדימה, ברכיים מעט כפופות.","חזה מובלט, כתפיים משוכות למטה, גב ישר מקובע.","הירידה (שאיפה): דחיפת האגן כמה שיותר לאחור (לא להתכופף).","המשקולות \"מגלחות\" את הרגליים, צמודות לשוקיים.","ראש: מבט למטה ומעט קדימה, צוואר בהמשך ישיר לעמוד השדרה.","לעצור כשיש מתיחה חזקה בירך האחורית.","העלייה (נשיפה): לדחוף את הרצפה עם העקבים ולדחוף את האגן חזק קדימה.","כיווץ סופי: לכווץ ישבן למעלה, מבלי להישען אחורה עם הגב התחתון."]}'::jsonb),
    ('x31', '{"id":"x31","cat":"cardio","name":"ריצת חוץ","type":"run"}'::jsonb),
    ('x32', '{"id":"x32","cat":"cardio","name":"הליכון","type":"machine"}'::jsonb),
    ('x33', '{"id":"x33","cat":"cardio","name":"אופניים","type":"machine"}'::jsonb),
    ('x34', '{"id":"x34","cat":"cardio","name":"מכונת חתירה","type":"machine"}'::jsonb),
    ('x35', '{"id":"x35","cat":"cardio","name":"אליפטיקל","type":"machine"}'::jsonb),
    ('x36', '{"id":"x36","cat":"pilates","name":"פילאטיס מכשירים","type":"pilates"}'::jsonb),
    ('h01', '{"id":"h01","cat":"legs","name":"גובלט סקוואט","en":"Goblet Squat","tips":["עמידה בפישוק מעט יותר מרוחב הכתפיים","אצבעות כפות הרגליים פונות מעט החוצה","להצמיד את המשקולת אנכית לחזה בשתיים ידיים","כתפיים משוכות לאחורה ומטה, חזה מובלט וגב זקוף","מרפקים צמודים פנימה לצלעות, מצביעים כלפי מטה (שלא יברחו החוצה)","כשיורדים לקחת שאיפה עמוקה. לאט, אחורה ולמטה כאילו מתיישבים על כסא.","עד שהמרפקים נכנסים בין החלק הפנימי של הברכיים.","כשעולים לדחוף את הרצפה עם כל כף הרגל (בדגש על עקבים)","נשיפה חזקה כל העלייה. לכווץ ישבן בסוף התנועה"],"tag":"home6","muscle_img_url":"","movement_img_url":""}'::jsonb),
    ('h02', '{"id":"h02","cat":"chest","name":"שכיבות סמיכה","en":"Push-Ups","tips":["ידיים על הרצפה מעט רחב יותר מהכתפיים","הגוף מוחזק בקו ישר לגמרי מהראש ועד העקבים","לכווץ חזק את הבטן והישבן, למנוע מהגב התחתון לשקוע","בירידה, המרפקים פונים אחורה ולצדדים בזווית של כ-45 מעלות מהגוף","כשיורדים לקחת שאיפה, לרדת לאט ובשליטה כיחידה אחת","להמשיך לרדת עד שהחזה כמעט נוגע ברצפה","כשעולים לדחוף את הרצפה חזק ומהר, נשיפה חזקה עד שהידיים ישרות"],"tag":"home6","muscle_img_url":"","movement_img_url":""}'::jsonb),
    ('h03', '{"id":"h03","cat":"back","name":"חתירה ביד אחת עם משקולת","en":"One-Arm Dumbbell Row","tips":["להישען עם ברך ויד (מאותו הצד) על ספה או כיסא","הרגל השנייה נשארת יציבה על הרצפה","גב ישר לגמרי (כמעט מקביל לרצפה), בטן אסופה","המבט מופנה למטה ומעט קדימה כדי לשמור על צוואר ניטרלי","משקולת ביד הפנויה יורדת עד הסוף למטה, מתיחה קלה לכתף והשכמה","בעלייה למשוך את המשקולת לכיוון האגן, כאילו מכניסים משהו לכיס","מרפק צמוד לצלעות במהלך המשיכה. כמה שיותר אחורה ולמעלה","לנשוף תוך כדי המשיכה למעלה, כווץ את השכמה בסוף התנועה","בירידה לקחת אוויר, להוריד את המשקולת לאט עד ליישור מלא של היד"],"tag":"home6","muscle_img_url":"","movement_img_url":""}'::jsonb),
    ('h04', '{"id":"h04","cat":"shoulders","name":"הרחקת כתף לצד ביד אחת","en":"One-Arm Lateral Raise","tips":["לעמוד ליד משקוף או עמוד, לאחוז ביד הפנויה ולהישען מעט החוצה בזווית","ביד השנייה להחזיק את המשקולת מונחת לצידי הגוף או מעט לפני הירך","מרפק כמעט ישר לגמרי, כיפוף קל וטבעי (לא לנעול!)","להרים את המשקולת הצידה עד גובה הכתף","הזרת מובילה את התנועה כלפי מעלה (כאילו מוזגים מים מקנקן)","בעלייה לנשוף. להקפיד לא להרים את הכתף לכיוון האוזן","בירידה לשאוף ולהוריד את המשקולת לאט ובשליטה (2-3 שניות)"],"tag":"home6","muscle_img_url":"","movement_img_url":""}'::jsonb),
    ('h05', '{"id":"h05","cat":"biceps","name":"כפיפת מרפקים עם משקולת","en":"Dumbbell Bicep Curls","tips":["עמידה יציבה, חזה פתוח, כתפיים משוכות לאחור. יד אוחזת במשקולת לצידי הגוף","להצמיד מרפק לצלעות - שלא יברח קדימה בעלייה או אחורה בירידה","בעלייה למשוך את המשקולת לכיוון הכתף, תוך כדי סיבוב של שורש כף היד כלפי חוץ","אז בשיא התנועה כף היד פונה אליי","לנשוף בעלייה ולכווץ חזק את השריר בשיא התנועה למשך שנייה","בירידה לשאוף ולהוריד את המשקולת לאט עד ליישור כמעט מלא של היד"],"tag":"home6","muscle_img_url":"","movement_img_url":""}'::jsonb),
    ('h06', '{"id":"h06","cat":"biceps","name":"האמר קרלס","en":"Hammer Curls","tips":["עמידה יציבה, חזה פתוח, כתפיים משוכות לאחור","יד אוחזת במשקולת באחיזה ניטרלית (כף היד פונה לכיוון הירך, כמו שמחזיקים פטיש)","מרפק צמוד לצלעות לאורך כל התנועה – שלא ינוע קדימה בעלייה או אחורה בירידה","בעלייה למשוך את המשקולת לכתף הקדמית, עדיין באחיזה נייטרלית","לנשוף בעלייה ולכווץ את השריר לשנייה בשיא התנועה","בירידה לשאוף, להוריד לאט ובשליטה"],"tag":"home6","muscle_img_url":"","movement_img_url":""}'::jsonb)
    ) as s(id, d)
    on conflict (sync_key, id) do update
      set kind = excluded.kind, usr = excluded.usr, ts = excluded.ts, del = excluded.del,
          d = excluded.d, srv = nextval('nt_seq')
      where excluded.ts > public.nt_rows.ts;
  end loop;
end
$seed$;
