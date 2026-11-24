-- =====================================================================
--  Kilométerekkel a Gyerekekért III – adatbázis séma (Supabase / Postgres)
--  Futtatás: Supabase Dashboard → SQL Editor → New query → beillesztés → Run
--  Egyszer kell lefuttatni egy üres projekten.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Beállítások (egyetlen sor)
-- ---------------------------------------------------------------------
create table public.settings (
  id                  int primary key default 1 check (id = 1),
  event_name          text not null default 'Kilométerekkel a Gyerekekért – Fitness Tribe Jótékonysági Futás, III. kiadás / Cu kilometri pentru copii – Eveniment de Alergare Caritabilă Fitness Tribe, ediția a III-a',
  event_start         date not null default '2026-12-01',
  event_end           date not null default '2026-12-21',
  submit_deadline     timestamptz not null default '2026-12-22 23:59:59+02',
  km_price            numeric(10,2) not null default 2 check (km_price > 0),
  max_km_per_activity numeric(6,2) not null default 100 check (max_km_per_activity > 0),
  entry_fee           numeric(10,2),
  bank_info_hu        text not null default '',
  bank_info_ro        text not null default ''
);
insert into public.settings (id, entry_fee, bank_info_hu, bank_info_ro) values (1, 50,
  E'Számlaszám: RO24BTRLRONCRT0465351002\nMegnevezés: ASOCIATIA FITNESS TRIBE EGYESULET\nMegjegyzés: "név + donatie pentru copiii"',
  E'Cont: RO24BTRLRONCRT0465351002\nDenumire: ASOCIATIA FITNESS TRIBE EGYESULET\nNotă: "nume + donatie pentru copiii"');

-- ---------------------------------------------------------------------
-- 2. Adminok
-- ---------------------------------------------------------------------
create table public.admins (
  user_id uuid primary key references auth.users on delete cascade
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- 3. Futók (profil – regisztrációkor automatikusan jön létre)
-- ---------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  full_name     text not null check (char_length(btrim(full_name)) between 3 and 80),
  email         text not null,
  phone         text,
  consent_at    timestamptz not null default now(),
  paid          boolean not null default false,
  paid_at       timestamptz,
  payment_note  text,
  created_at    timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone)
  values (
    new.id,
    regexp_replace(btrim(coalesce(new.raw_user_meta_data->>'full_name', '')), '\s+', ' ', 'g'),
    new.email,
    nullif(btrim(coalesce(new.raw_user_meta_data->>'phone', '')), '')
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A futó nem írhatja át a befizetési adatait és az e-mail-címét
create or replace function public.protect_profile()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    new.paid         := old.paid;
    new.paid_at      := old.paid_at;
    new.payment_note := old.payment_note;
    new.email        := old.email;
    new.consent_at   := old.consent_at;
  elsif new.paid is distinct from old.paid then
    new.paid_at := case when new.paid then now() else null end;
  end if;
  new.full_name := regexp_replace(btrim(new.full_name), '\s+', ' ', 'g');
  return new;
end $$;

create trigger profiles_protect
  before update on public.profiles
  for each row execute function public.protect_profile();

-- ---------------------------------------------------------------------
-- 4. Futások (aktivitások)
-- ---------------------------------------------------------------------
create table public.activities (
  id            bigint generated always as identity primary key,
  runner_id     uuid not null references public.profiles on delete cascade,
  run_date      date not null,
  km            numeric(6,2) not null check (km > 0),
  proof_type    text not null check (proof_type in ('link', 'photo')),
  proof_url     text,
  photo_path    text,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reject_reason text,
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz,
  constraint proof_present check (coalesce(
    (proof_type = 'link'  and proof_url ~* '^https?://') or
    (proof_type = 'photo' and photo_path is not null), false))
);
create index activities_runner_idx on public.activities (runner_id);
create index activities_status_idx on public.activities (status);
-- Ugyanazt a linket nem lehet kétszer beküldeni (elutasított beküldés nem számít)
create unique index activities_proof_url_uniq
  on public.activities (lower(proof_url))
  where proof_url is not null and status <> 'rejected';

-- Beküldési szabályok (dátum, határidő, max. km) – a futókra érvényes, adminra nem
create or replace function public.validate_activity()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  s public.settings;
begin
  if public.is_admin() then
    return new;
  end if;

  select * into s from public.settings where id = 1;

  new.runner_id     := auth.uid();
  new.status        := 'pending';
  new.reject_reason := null;
  new.reviewed_at   := null;

  if now() > s.submit_deadline then
    raise exception 'DEADLINE_PASSED';
  end if;
  if new.run_date < s.event_start or new.run_date > s.event_end then
    raise exception 'DATE_OUT_OF_RANGE';
  end if;
  if new.run_date > (now() at time zone 'Europe/Bucharest')::date then
    raise exception 'DATE_IN_FUTURE';
  end if;
  if new.km > s.max_km_per_activity then
    raise exception 'KM_TOO_HIGH';
  end if;
  return new;
end $$;

create trigger activities_validate
  before insert on public.activities
  for each row execute function public.validate_activity();

create or replace function public.stamp_review()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    new.reviewed_at := case when new.status = 'pending' then null else now() end;
    if new.status <> 'rejected' then
      new.reject_reason := null;
    end if;
  end if;
  return new;
end $$;

create trigger activities_review
  before update on public.activities
  for each row execute function public.stamp_review();

-- ---------------------------------------------------------------------
-- 5. Szponzorok / adományok
-- ---------------------------------------------------------------------
create table public.sponsors (
  id           bigint generated always as identity primary key,
  kind         text not null default 'company' check (kind in ('company', 'person')),
  name         text not null,
  amount       numeric(10,2) not null default 0 check (amount >= 0),
  paid         boolean not null default false,
  show_public  boolean not null default true,
  logo_url     text,
  website      text,
  note         text,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Jogosultságok (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.settings   enable row level security;
alter table public.admins     enable row level security;
alter table public.profiles   enable row level security;
alter table public.activities enable row level security;
alter table public.sponsors   enable row level security;

-- settings: mindenki olvashatja, csak admin módosíthatja
create policy settings_read   on public.settings for select using (true);
create policy settings_update on public.settings for update using (public.is_admin()) with check (public.is_admin());

-- admins: mindenki csak a saját sorát látja
create policy admins_self on public.admins for select using (user_id = auth.uid());

-- profiles: saját profil vagy admin
create policy profiles_select on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update using (id = auth.uid() or public.is_admin())
                                                            with check (id = auth.uid() or public.is_admin());
create policy profiles_delete on public.profiles for delete using (public.is_admin());

-- activities: futó a sajátjait látja és küldheti be; csak admin bírálhat
create policy activities_select on public.activities for select using (runner_id = auth.uid() or public.is_admin());
create policy activities_insert on public.activities for insert to authenticated
  with check (runner_id = auth.uid() or public.is_admin());
create policy activities_update on public.activities for update using (public.is_admin()) with check (public.is_admin());
create policy activities_delete on public.activities for delete
  using (public.is_admin() or (runner_id = auth.uid() and status = 'pending'));

-- sponsors: csak admin (a nyilvános lista a public_sponsors() függvényen át megy)
create policy sponsors_admin on public.sponsors for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 7. Nyilvános adatok (belépés nélkül is elérhető)
--    Csak elfogadott futás ÉS visszaigazolt befizetés számít.
-- ---------------------------------------------------------------------
create or replace function public.public_leaderboard()
returns table (runner_id uuid, full_name text, km numeric, runs bigint)
language sql stable security definer set search_path = public
as $$
  select p.id as runner_id, p.full_name, round(sum(a.km), 2) as km, count(*) as runs
  from public.activities a
  join public.profiles p on p.id = a.runner_id
  where a.status = 'approved' and p.paid
  group by p.id, p.full_name
  order by km desc, p.full_name;
$$;

-- Egy futó elfogadott futásai (csak dátum és km; igazolás nem nyilvános)
create or replace function public.public_runner_runs(p_runner uuid)
returns table (run_date date, km numeric)
language sql stable security definer set search_path = public
as $$
  select a.run_date, a.km
  from public.activities a
  join public.profiles p on p.id = a.runner_id
  where a.runner_id = p_runner and a.status = 'approved' and p.paid
  order by a.run_date desc, a.id desc;
$$;

create or replace function public.public_stats()
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'total_km', coalesce((
        select round(sum(a.km), 2) from public.activities a
        join public.profiles p on p.id = a.runner_id
        where a.status = 'approved' and p.paid), 0),
    'active_runners', (
        select count(distinct a.runner_id) from public.activities a
        join public.profiles p on p.id = a.runner_id
        where a.status = 'approved' and p.paid),
    'sponsor_km', coalesce((
        select round(sum(s.amount) / (select km_price from public.settings where id = 1), 0)
        from public.sponsors s where s.paid), 0)
  );
$$;

create or replace function public.public_sponsors()
returns table (kind text, name text, km numeric, logo_url text, website text)
language sql stable security definer set search_path = public
as $$
  select s.kind, s.name,
         round(s.amount / (select km_price from public.settings where id = 1), 0) as km,
         s.logo_url, s.website
  from public.sponsors s
  where s.paid and s.show_public
  order by s.amount desc, s.name;
$$;

-- Napi összesítő az adventi naptárhoz: napi km és hány futótól
create or replace function public.public_daily()
returns table (run_date date, km numeric, runners bigint)
language sql stable security definer set search_path = public
as $$
  select a.run_date, round(sum(a.km), 2) as km, count(distinct a.runner_id) as runners
  from public.activities a
  join public.profiles p on p.id = a.runner_id
  where a.status = 'approved' and p.paid
  group by a.run_date
  order by a.run_date;
$$;

grant execute on function public.public_daily()       to anon, authenticated;
grant execute on function public.public_leaderboard() to anon, authenticated;
grant execute on function public.public_runner_runs(uuid) to anon, authenticated;
grant execute on function public.public_stats()       to anon, authenticated;
grant execute on function public.public_sponsors()    to anon, authenticated;
grant execute on function public.is_admin()           to anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. Képtároló az igazolásokhoz (privát, max. 5 MB / kép)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy proofs_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy proofs_select on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

create policy proofs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'proofs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- =====================================================================
--  KÉSZ. Az admin kijelölése (miután regisztráltál a weboldalon):
--
--    insert into public.admins (user_id)
--    select id from auth.users where email = 'IDE-AZ-ADMIN-EMAIL@pelda.ro';
-- =====================================================================
