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
      insert into public.exercise_db (sync_key, id, usr, name, name_en, muscle_group, workout_type, tips, muscle_img_url, movement_img_url, auto_created, updated_ts)
      values (r.sync_key, r.id, r.usr, coalesce(r.d->>'name', ''), r.d->>'en', r.d->>'cat',
              coalesce(r.d->>'type', case r.d->>'cat' when 'cardio' then 'machine' when 'pilates' then 'pilates' else 'strength' end),
              case when jsonb_typeof(r.d->'tips') = 'array' then r.d->'tips' else '[]'::jsonb end,
              nullif(r.d->>'muscle_img_url', ''), nullif(r.d->>'movement_img_url', ''),
              coalesce((r.d->>'auto')::boolean, false), r.ts)
      on conflict (sync_key, id) do update
        set usr = excluded.usr, name = excluded.name, name_en = excluded.name_en, muscle_group = excluded.muscle_group,
            workout_type = excluded.workout_type, tips = excluded.tips,
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
    ('p01', '{"id":"p01","name":"לחיצת חזה במכשיר","cat":"chest","en":"Chest Press Machine","tips":["לכוון את הכיסא כך שהידיות באמצע החזה","נעילת שכמות: לדמיין עיפרון בין השכמות","בלימת משקל איטית (2-3 שניות)","רגליים נעוצות ברצפה"]}'::jsonb),
    ('p02', '{"id":"p02","name":"מכשיר לחיצה בשיפוע חיובי","cat":"chest","en":"Incline Press Machine","tips":["ידיות בקו החזה העליון","מרפקים ב-45 מעלות כלפי מטה","טווח תנועה מבוקר לטובת הכתף"]}'::jsonb),
    ('p03', '{"id":"p03","name":"משיכת פולי עליון","cat":"back","en":"Lat Pulldown","tips":["אחיזה רחבה מעט מהכתפיים","הורדת השכמות למטה ואז משיכה עם המרפקים לכיוון החזה העליון","שליטה של 2-3 שניות בעלייה"]}'::jsonb),
    ('p04', '{"id":"p04","name":"חתירה במכשיר ישיבה","cat":"back","en":"Seated Row Machine","tips":["משיכה לאזור הפופיק / בטן תחתונה","מרפקים קרובים לגוף","כיווץ שכמות בסוף התנועה, כמו מעיכת כדור טניס"]}'::jsonb),
    ('p05', '{"id":"p05","name":"פשיטת כתף בכבל בעמידה","cat":"back","en":"Straight-Arm Pulldown","tips":["שני צעדים אחורה, למתיחה תמידית","ידיים ישרות עם כיפוף קל","תנועת קשת עד הירכיים"]}'::jsonb),
    ('p06', '{"id":"p06","name":"פשיטת גו בספסל ייעודי","cat":"back","en":"Back Extension","tips":["קצה הכרית מתחת למותניים","ירידה עם גב ישר","עלייה עד קו ישר, בלי הקשתה לאחור"]}'::jsonb),
    ('p07', '{"id":"p07","name":"לחיצת כתפיים במכשיר ישיבה","cat":"shoulders","en":"Shoulder Press Machine","tips":["ידיות בגובה הכתפיים או טיפה מעל","מרפקים באלכסון קדימה","לא לנעול את המרפקים לגמרי למעלה"]}'::jsonb),
    ('p08', '{"id":"p08","name":"הרחקת זרועות בפולי תחתון","cat":"shoulders","en":"Cable Lateral Raises","tips":["עמידה לצד המכשיר","הובלה מהמרפק כלפי מעלה עד גובה הכתף","ירידה מבוקרת"]}'::jsonb),
    ('p09', '{"id":"p09","name":"כפיפת פטישים עם משקולות","cat":"biceps","en":"Dumbbell Hammer Curls","tips":["אחיזה ניטרלית","עבודה לסירוגין","מרפקים צמודים לצלעות, ללא תזוזה"]}'::jsonb),
    ('p10', '{"id":"p10","name":"כפיפת מרפקים במוט בפולי תחתון","cat":"biceps","en":"Cable Bicep Curls","tips":["בטן מכווצת","ציר תנועה יחיד במרפק","שליטה בירידה"]}'::jsonb),
    ('p11', '{"id":"p11","name":"פשיטת מרפקים בפולי עליון עם חבל","cat":"triceps","en":"Tricep Rope Pushdown","tips":["הישענות קלה קדימה","מרפקים צמודים לצלעות","פתיחת החבל לצדדים בסוף הפשיטה"]}'::jsonb),
    ('p12', '{"id":"p12","name":"פשיטת ברכיים במכשיר","cat":"legs","en":"Leg Extension","tips":["ציר הברך מקביל לציר המכונה","קיבוע הישבן","עצירה של שנייה שלמה למעלה"]}'::jsonb),
    ('p13', '{"id":"p13","name":"כפיפת ברכיים במכשיר","cat":"legs","en":"Leg Curl","tips":["ציר תנועה מדויק מול הברך","כיווץ חזק ושחרור איטי של 2-3 שניות"]}'::jsonb),
    ('p14', '{"id":"p14","name":"דדליפט רומני","cat":"legs","en":"RDL","tips":["האגן הולך אחורה","גב מקובע וישר לחלוטין בכל שלב","משקולות צמודות לשוקיים","דחיפת האגן קדימה בעלייה"]}'::jsonb),
    ('x31', '{"id":"x31","name":"ריצת חוץ","cat":"cardio","type":"run"}'::jsonb),
    ('x32', '{"id":"x32","name":"הליכון","cat":"cardio","type":"machine"}'::jsonb),
    ('x33', '{"id":"x33","name":"אופניים","cat":"cardio","type":"machine"}'::jsonb),
    ('x34', '{"id":"x34","name":"מכונת חתירה","cat":"cardio","type":"machine"}'::jsonb),
    ('x35', '{"id":"x35","name":"אליפטיקל","cat":"cardio","type":"machine"}'::jsonb),
    ('x36', '{"id":"x36","name":"פילאטיס מכשירים","cat":"pilates","type":"pilates"}'::jsonb)
    ) as s(id, d)
    on conflict (sync_key, id) do update
      set kind = excluded.kind, usr = excluded.usr, ts = excluded.ts, del = excluded.del,
          d = excluded.d, srv = nextval('nt_seq')
      where excluded.ts > public.nt_rows.ts;
  end loop;
end
$seed$;
