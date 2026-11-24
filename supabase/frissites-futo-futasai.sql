-- Frissítés: a ranglistán a futó nevére kattintva látszik, milyen futásokból áll össze az összkilométere.
-- Csak akkor kell lefuttatni, ha a schema.sql régebbi változatát már futtattad.
-- Supabase → SQL Editor → illeszd be → Run.

drop function if exists public.public_leaderboard();

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

grant execute on function public.public_leaderboard()          to anon, authenticated;
grant execute on function public.public_runner_runs(uuid)     to anon, authenticated;
