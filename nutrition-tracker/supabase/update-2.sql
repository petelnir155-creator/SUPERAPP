-- Update 2 (short). Run once in Supabase: SQL Editor > New query > Run. Safe to run again.
-- Requires setup.sql and reporting.sql to have been run before.
-- 1. exercise_db: image columns muscle_img_url (anatomy) and movement_img_url (movement).
-- 2. work_shifts: created if missing, and the columns hourly_rate (ILS per hour), notes and total_amount.
-- 3. The mirror function is replaced so the new fields are copied, then existing rows are re-copied.

alter table public.exercise_db add column if not exists muscle_img_url text;
alter table public.exercise_db add column if not exists movement_img_url text;

create table if not exists public.work_shifts (
  sync_key   text    not null,
  id         text    not null,
  usr        text    not null,
  shift_date date    not null,
  minutes    integer not null,
  hours      numeric generated always as (round(minutes / 60.0, 2)) stored,
  hourly_rate numeric,
  notes      text,
  total_amount numeric generated always as (round(minutes / 60.0 * coalesce(hourly_rate, 0), 2)) stored,
  updated_ts bigint  not null,
  primary key (sync_key, id)
);
alter table public.work_shifts add column if not exists hourly_rate numeric;
alter table public.work_shifts add column if not exists notes text;
alter table public.work_shifts add column if not exists total_amount numeric generated always as (round(minutes / 60.0 * coalesce(hourly_rate, 0), 2)) stored;
create index if not exists work_shifts_day on public.work_shifts (sync_key, usr, shift_date);
alter table public.work_shifts enable row level security;
revoke all on public.work_shifts from anon, authenticated;

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
            workout_type = excluded.workout_type, tips = excluded.tips, muscle_img_url = excluded.muscle_img_url,
            movement_img_url = excluded.movement_img_url, auto_created = excluded.auto_created, updated_ts = excluded.updated_ts;
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

revoke all on function public.nt_mirror_row(public.nt_rows) from public, anon, authenticated;

select public.nt_mirror_row(t) from public.nt_rows t where t.kind in ('ex', 'shift');
