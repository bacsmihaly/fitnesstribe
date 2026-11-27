-- Az admin kézzel rögzíthet futást egy futó helyett (proof_type = 'manual').
-- Egyszer kell lefuttatni a Supabase SQL Editorban.
alter table public.activities drop constraint if exists activities_proof_type_check;
alter table public.activities add constraint activities_proof_type_check
  check (proof_type in ('link', 'photo', 'manual'));
alter table public.activities drop constraint if exists proof_present;
alter table public.activities add constraint proof_present check (coalesce(
  (proof_type = 'link'  and proof_url ~* '^https?://') or
  (proof_type = 'photo' and photo_path is not null) or
  (proof_type = 'manual'), false));
