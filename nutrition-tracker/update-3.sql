-- Update 3: the exercise group "אימון ביתי (6 ק״ג)" (6 exercises with tips, tag home6).
-- Run once in Supabase: SQL Editor > New query. Safe to run again.
-- Before running, replace PASTE-YOUR-SYNC-KEY-HERE with your sync key (Settings > Cloud).
-- Requires update-2.sql (or reporting.sql) to have been run before.
-- 1. exercise_db gets a tag column, and the mirror function copies it.
-- 2. The 6 exercises are added to nt_rows for both users (ts=2, so a newer edit made in the app is never overwritten),
--    which also creates their exercise_db rows, ready for muscle_img_url / movement_img_url.

alter table public.exercise_db add column if not exists tag text;

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

revoke all on function public.nt_mirror_row(public.nt_rows) from public, anon, authenticated;

select public.nt_mirror_row(t) from public.nt_rows t where t.kind in ('ex', 'shift');

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
