-- ============================================================
-- La Vierta: Auth email/senha + Admin + Nicks
-- ============================================================
-- - Profiles ganham 'nick' (editável) e 'role' (admin | player)
-- - bertosouchu@gmail.com vira admin automaticamente
-- - Players são vinculados a user_id (auth.users)
-- - RLS volta a ser auth-aware (read all, write own)
-- ============================================================

-- 1. Profiles com nick + role
alter table public.profiles add column if not exists nick text;
alter table public.profiles add column if not exists role text not null default 'player';

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_nick_idx on public.profiles(lower(nick));

-- Garante uniqueness do nick (case-insensitive) — mas permite null
create unique index if not exists profiles_nick_unique
  on public.profiles(lower(nick)) where nick is not null;

-- 2. Trigger atualizado: cria profile com nick default + role admin pro Humberto
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  default_nick text;
  default_role text;
begin
  default_nick := coalesce(
    new.raw_user_meta_data->>'nick',
    split_part(new.email, '@', 1)
  );
  default_role := case
    when new.email = 'bertosouchu@gmail.com' then 'admin'
    else 'player'
  end;

  insert into public.profiles (id, email, nick, role)
  values (new.id, new.email, default_nick, default_role)
  on conflict (id) do update
    set email = excluded.email,
        nick = coalesce(public.profiles.nick, excluded.nick),
        role = case
          when public.profiles.role = 'admin' then 'admin'
          else excluded.role
        end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Players: vinculados a user_id
alter table public.players add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Permite múltiplos players "anônimos" (com client_id mas sem user) ou um único por user
create unique index if not exists players_campaign_user_uniq
  on public.players(campaign_id, user_id)
  where user_id is not null;

-- 4. RLS: profiles
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_select_all" on public.profiles;

-- Todos veem todos os nicks (lobby precisa)
create policy "profiles_select_all" on public.profiles for select using (true);
-- Cada um edita o próprio
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
-- Insert é feito pelo trigger; permite o próprio user também
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

-- 5. RLS: players (auth-aware)
drop policy if exists "players_open" on public.players;
drop policy if exists "players_select_all" on public.players;
drop policy if exists "players_self_insert" on public.players;
drop policy if exists "players_self_update" on public.players;
drop policy if exists "players_self_delete" on public.players;

create policy "players_select_all" on public.players for select using (true);
create policy "players_self_insert" on public.players for insert
  with check (user_id is null or auth.uid() = user_id);
create policy "players_self_update" on public.players for update
  using (user_id is null or auth.uid() = user_id);
create policy "players_self_delete" on public.players for delete
  using (user_id is null or auth.uid() = user_id);

-- 6. RLS: campaigns — só admin cria/edita; todos leem
drop policy if exists "campaigns_open_read" on public.campaigns;
drop policy if exists "campaigns_open_write" on public.campaigns;
drop policy if exists "campaigns_admin_write" on public.campaigns;
drop policy if exists "campaigns_member_read" on public.campaigns;

create policy "campaigns_open_read" on public.campaigns for select using (true);
create policy "campaigns_admin_write" on public.campaigns for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 7. RLS: characters — dono edita, todos leem
drop policy if exists "characters_open" on public.characters;
drop policy if exists "characters_member_read" on public.characters;
drop policy if exists "characters_owner_write" on public.characters;

create policy "characters_select_all" on public.characters for select using (true);
create policy "characters_owner_write" on public.characters for all
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- 8. RLS: sessions, combat_log, npcs, locations, quests, memory — admin escreve, todos leem
do $$
declare
  t text;
  tbls text[] := array['sessions', 'combat_log', 'npcs', 'locations', 'quests', 'memory_chunks'];
begin
  foreach t in array tbls loop
    execute format('drop policy if exists "%I_open" on public.%I', t, t);
    execute format('drop policy if exists "%I_select_all" on public.%I', t, t);
    execute format('drop policy if exists "%I_admin_write" on public.%I', t, t);
    execute format(
      'create policy "%I_select_all" on public.%I for select using (true)', t, t
    );
    execute format(
      'create policy "%I_admin_write" on public.%I for all
       using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = ''admin''))
       with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = ''admin''))',
      t, t
    );
  end loop;
end$$;

-- 9. Função RPC: reset_campaign (só admin pode chamar)
create or replace function public.reset_campaign(campaign_uuid uuid)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  is_admin boolean;
  deleted_counts json;
begin
  -- Verifica se chamador é admin
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) into is_admin;

  if not is_admin then
    raise exception 'Apenas admins podem resetar campanhas';
  end if;

  -- Deleta dados de progresso (mantém players/profiles)
  delete from public.combat_log where session_id in (
    select id from public.sessions where campaign_id = campaign_uuid
  );
  delete from public.sessions where campaign_id = campaign_uuid;
  delete from public.npcs where campaign_id = campaign_uuid;
  delete from public.locations where campaign_id = campaign_uuid;
  delete from public.quests where campaign_id = campaign_uuid;
  delete from public.memory_chunks where campaign_id = campaign_uuid;
  delete from public.characters where campaign_id = campaign_uuid;

  -- Reset chapter
  update public.campaigns set current_chapter = 1, updated_at = now() where id = campaign_uuid;

  return json_build_object(
    'success', true,
    'campaign_id', campaign_uuid,
    'reset_at', now()
  );
end;
$$;

-- 10. Backfill: garantir que profiles existe pro Humberto se ele já tiver auth.user
insert into public.profiles (id, email, nick, role)
select u.id, u.email, split_part(u.email, '@', 1),
  case when u.email = 'bertosouchu@gmail.com' then 'admin' else 'player' end
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- Forçar admin se já existir profile do Humberto
update public.profiles
  set role = 'admin'
  where email = 'bertosouchu@gmail.com';
