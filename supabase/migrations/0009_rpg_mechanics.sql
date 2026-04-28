-- ============================================================
-- Migration 0009: Mecânicas RPG profissionais
-- - spell_slots, conditions, death_saves em characters
-- - combat_initiative tracker
-- - notes (pessoais e da party)
-- - quest_objectives expandido
-- - npc_journal (NPCs conhecidos)
-- - factions (relação com grupos)
-- - DM lock (anti-double-fire)
-- ============================================================

-- 1. CHARACTERS — campos novos
alter table public.characters add column if not exists spell_slots jsonb default '{}'::jsonb;
-- formato: { "1": {"max": 2, "used": 0}, "2": {"max": 0, "used": 0}, ... }

alter table public.characters add column if not exists conditions jsonb default '[]'::jsonb;
-- formato: [{ "name":"envenenado", "source":"aranha gigante", "expires_at":"...", "modifiers":{} }]

alter table public.characters add column if not exists death_saves jsonb default '{"successes":0,"failures":0,"stable":false}'::jsonb;

alter table public.characters add column if not exists xp int default 0;
alter table public.characters add column if not exists hit_dice_current int;
alter table public.characters add column if not exists inspiration boolean default false;
alter table public.characters add column if not exists exhaustion int default 0; -- 0..6
alter table public.characters add column if not exists speed int default 9; -- metros (≈30ft)

-- 2. COMBAT_INITIATIVE
create table if not exists public.combat_initiative (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  actor_type text not null check (actor_type in ('player','npc','enemy')),
  actor_id text not null, -- character.id (string) ou nome de NPC/inimigo
  display_name text not null,
  initiative int not null,
  position int not null default 0, -- ordem no round
  hp_current int,
  hp_max int,
  ac int,
  is_current boolean default false,
  created_at timestamptz default now()
);
create index if not exists ci_session_idx on public.combat_initiative(session_id);
create index if not exists ci_position_idx on public.combat_initiative(session_id, position);

alter table public.combat_initiative enable row level security;
drop policy if exists ci_select on public.combat_initiative;
drop policy if exists ci_write on public.combat_initiative;
create policy ci_select on public.combat_initiative for select using (true);
create policy ci_write on public.combat_initiative for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- 3. NOTES (pessoais + party)
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  scope text not null check (scope in ('self','party','dm')),
  title text,
  body text not null default '',
  pinned boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists notes_campaign_idx on public.notes(campaign_id);
create index if not exists notes_scope_idx on public.notes(campaign_id, scope);

alter table public.notes enable row level security;
drop policy if exists notes_select on public.notes;
drop policy if exists notes_insert on public.notes;
drop policy if exists notes_update on public.notes;
drop policy if exists notes_delete on public.notes;
-- Pessoal: só dono lê; Party: todos da campanha lêem; DM: só admin
create policy notes_select on public.notes for select using (
  scope = 'party'
  or (scope = 'self' and user_id = auth.uid())
  or (scope = 'dm' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
);
create policy notes_insert on public.notes for insert with check (
  auth.uid() is not null and (
    (scope in ('self','party') and user_id = auth.uid())
    or (scope = 'dm' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  )
);
create policy notes_update on public.notes for update using (
  user_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy notes_delete on public.notes for delete using (
  user_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- 4. NPC_JOURNAL (NPCs conhecidos pelos players)
create table if not exists public.npc_journal (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  appearance text,
  bordao text, -- frase típica
  faction text,
  relation int default 0, -- -100 a +100
  first_met_at timestamptz default now(),
  last_seen_at timestamptz,
  notes text,
  portrait_url text,
  unique (campaign_id, name)
);
create index if not exists npc_campaign_idx on public.npc_journal(campaign_id);

alter table public.npc_journal enable row level security;
drop policy if exists npc_select on public.npc_journal;
drop policy if exists npc_write on public.npc_journal;
create policy npc_select on public.npc_journal for select using (true);
create policy npc_write on public.npc_journal for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- 5. FACTIONS
create table if not exists public.factions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  description text,
  reputation int default 0, -- -100 hostil, 0 neutro, +100 aliado
  banner_color text,
  unique (campaign_id, name)
);
alter table public.factions enable row level security;
drop policy if exists factions_select on public.factions;
drop policy if exists factions_write on public.factions;
create policy factions_select on public.factions for select using (true);
create policy factions_write on public.factions for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- 6. SESSIONS — DM lock
alter table public.sessions add column if not exists dm_locked_until timestamptz;
alter table public.sessions add column if not exists time_of_day text default 'day';
alter table public.sessions add column if not exists weather text default 'clear';
alter table public.sessions add column if not exists in_combat boolean default false;

-- 7. RPC: avançar turno atomicamente
create or replace function public.advance_turn(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  curr uuid;
  next_user uuid;
  player_ids uuid[];
  curr_idx int;
begin
  if auth.uid() is null then raise exception 'unauth'; end if;

  select current_turn_player_id into curr from public.sessions where id = p_session_id;

  select array_agg(user_id order by joined_at) into player_ids
  from public.players
  where campaign_id = (select campaign_id from public.sessions where id = p_session_id)
    and user_id is not null;

  if array_length(player_ids, 1) is null or array_length(player_ids, 1) = 0 then
    return null;
  end if;

  if curr is null then
    next_user := player_ids[1];
  else
    select array_position(player_ids, curr) into curr_idx;
    if curr_idx is null or curr_idx >= array_length(player_ids, 1) then
      next_user := player_ids[1];
    else
      next_user := player_ids[curr_idx + 1];
    end if;
  end if;

  update public.sessions set current_turn_player_id = next_user where id = p_session_id;
  return next_user;
end;
$$;
grant execute on function public.advance_turn(uuid) to authenticated;

-- 8. RPC: lock DM (60s) — evita disparos paralelos
create or replace function public.try_lock_dm(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ok int;
begin
  if auth.uid() is null then return false; end if;
  update public.sessions
    set dm_locked_until = now() + interval '60 seconds'
    where id = p_session_id
      and (dm_locked_until is null or dm_locked_until < now());
  get diagnostics ok = row_count;
  return ok = 1;
end;
$$;
grant execute on function public.try_lock_dm(uuid) to authenticated;

create or replace function public.release_dm_lock(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sessions set dm_locked_until = null where id = p_session_id;
end;
$$;
grant execute on function public.release_dm_lock(uuid) to authenticated;

-- 9. Realtime publish para tabelas novas
do $$
begin
  perform 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'combat_initiative';
  if not found then
    alter publication supabase_realtime add table public.combat_initiative;
  end if;
exception when others then null;
end $$;

do $$
begin
  perform 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notes';
  if not found then
    alter publication supabase_realtime add table public.notes;
  end if;
exception when others then null;
end $$;

do $$
begin
  perform 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'npc_journal';
  if not found then
    alter publication supabase_realtime add table public.npc_journal;
  end if;
exception when others then null;
end $$;

do $$
begin
  perform 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'factions';
  if not found then
    alter publication supabase_realtime add table public.factions;
  end if;
exception when others then null;
end $$;

select 'migration 0009 ok' as status;
