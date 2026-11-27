-- Település (city) oszlop a futóknak; a már regisztráltak települése: Sepsiszentgyörgy.
alter table public.profiles add column if not exists city text;
update public.profiles set city = 'Sepsiszentgyörgy' where city is null or btrim(city) = '';

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone, city)
  values (
    new.id,
    regexp_replace(btrim(coalesce(new.raw_user_meta_data->>'full_name', '')), '\s+', ' ', 'g'),
    new.email,
    nullif(btrim(coalesce(new.raw_user_meta_data->>'phone', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data->>'city', '')), '')
  );
  return new;
end $$;
