create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, global_role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    case
      when lower(new.email) = 'finnbierlich@yahoo.com' then 'admin'::public.global_role
      else 'user'::public.global_role
    end
  )
  on conflict (id) do update
  set
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
    global_role = case
      when lower(new.email) = 'finnbierlich@yahoo.com' then 'admin'::public.global_role
      else public.profiles.global_role
    end,
    updated_at = now();

  return new;
end;
$$;

update public.profiles p
set
  global_role = 'admin',
  updated_at = now()
from auth.users u
where u.id = p.id
  and lower(u.email) = 'finnbierlich@yahoo.com';
