-- Run once in the SQL editor of a fresh Supabase project.
-- This is initial setup, not a deployment migration. Enable anonymous Auth
-- sign-ins separately in Authentication > Providers before using the app.
begin;

create table public.people (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null
    constraint people_name_nonblank check (name ~ '[^[:space:]]')
    constraint people_name_length check (char_length(name) <= 200),
  email text not null
    constraint people_email_nonblank check (email ~ '[^[:space:]]')
    constraint people_email_length check (char_length(email) <= 254),
  age integer not null constraint people_age_range check (age between 0 and 150),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create index people_owner_name_id_idx on public.people (owner_id, name, id);

create function public.enforce_people_metadata()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Ignore client-supplied timestamps: the database owns both values.
    new.created_at := statement_timestamp();
    new.updated_at := new.created_at;
    return new;
  end if;

  if new.id is distinct from old.id
    or new.owner_id is distinct from old.owner_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Record ID, owner, and creation time cannot be changed'
      using errcode = '23514';
  end if;

  if row(new.name, new.email, new.age)
    is distinct from row(old.name, old.email, old.age) then
    new.updated_at := statement_timestamp();
  else
    new.updated_at := old.updated_at;
  end if;

  -- Return the row even on an identical upsert, so .select().single() can
  -- confirm the persisted record without changing its timestamp.
  return new;
end;
$$;

create trigger enforce_people_metadata
before insert or update on public.people
for each row execute function public.enforce_people_metadata();

alter table public.people enable row level security;

-- Anonymous Auth identities use authenticated, not the unauthenticated anon
-- database role. No unauthenticated table access is granted.
revoke all on table public.people from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.people to authenticated;
revoke all on function public.enforce_people_metadata() from public, anon;

create policy people_select_own
on public.people for select to authenticated
using ((select auth.uid()) = owner_id);

create policy people_insert_own
on public.people for insert to authenticated
with check ((select auth.uid()) = owner_id);

create policy people_update_own
on public.people for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy people_delete_own
on public.people for delete to authenticated
using ((select auth.uid()) = owner_id);

commit;
