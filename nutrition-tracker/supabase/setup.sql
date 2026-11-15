-- Run once in Supabase: SQL Editor > New query > Run
create sequence if not exists nt_seq;

create table if not exists public.nt_rows (
  sync_key text   not null,
  id       text   not null,
  kind     text   not null,
  usr      text   not null,
  ts       bigint not null,
  del      boolean not null default false,
  d        jsonb  not null default '{}'::jsonb,
  srv      bigint not null default nextval('nt_seq'),
  primary key (sync_key, id)
);
create index if not exists nt_rows_srv on public.nt_rows (sync_key, srv);

-- The table is closed: no policies, no grants for anon. Access only through the two functions below.
alter table public.nt_rows enable row level security;
revoke all on public.nt_rows from anon, authenticated;

create or replace function public.nt_push(p_key text, p_rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if length(coalesce(p_key, '')) < 16 then raise exception 'bad sync key'; end if;
  insert into public.nt_rows (sync_key, id, kind, usr, ts, del, d)
  select p_key, r->>'id', r->>'kind', r->>'usr', (r->>'ts')::bigint,
         coalesce((r->>'del')::boolean, false), coalesce(r->'d', '{}'::jsonb)
  from jsonb_array_elements(p_rows) r
  on conflict (sync_key, id) do update
    set kind = excluded.kind, usr = excluded.usr, ts = excluded.ts, del = excluded.del,
        d = excluded.d, srv = nextval('nt_seq')
    where excluded.ts > public.nt_rows.ts;
end $$;

create or replace function public.nt_pull(p_key text, p_since bigint, p_limit int default 500)
returns table (id text, kind text, usr text, ts bigint, del boolean, d jsonb, srv bigint)
language plpgsql security definer set search_path = public as $$
begin
  if length(coalesce(p_key, '')) < 16 then raise exception 'bad sync key'; end if;
  return query
    select t.id, t.kind, t.usr, t.ts, t.del, t.d, t.srv
    from public.nt_rows t
    where t.sync_key = p_key and t.srv > p_since
    order by t.srv limit least(p_limit, 1000);
end $$;

revoke all on function public.nt_push(text, jsonb) from public;
revoke all on function public.nt_pull(text, bigint, int) from public;
grant execute on function public.nt_push(text, jsonb) to anon, authenticated;
grant execute on function public.nt_pull(text, bigint, int) to anon, authenticated;
