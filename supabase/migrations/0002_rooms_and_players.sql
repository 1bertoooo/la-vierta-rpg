-- ============================================================
-- La Vierta: Sistema de Sala Persistente (sem auth email)
-- ============================================================
-- Filosofia: a URL é o segredo. 4 amigos compartilham o link.
-- Cada player se identifica por client_id (uuid no localStorage).
-- ============================================================

-- 1. Adicionar código curto à campaign (= sala)
alter table public.campaigns add column if not exists code text unique;

update public.campaigns
  set code = 'velreth-elite'
  where id = '00000000-0000-0000-0000-000000000001'
    and code is null;

create index if not exists campaigns_code_idx on public.campaigns(code);

-- 2. Tabela players (sem auth, identificação por client_id do navegador)
create table if not exists public.players (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  display_name text not null,
  client_id text not null,
  last_seen_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (campaign_id, client_id)
);

create index if not exists players_campaign_idx on public.players(campaign_id);

-- 3. Vincula characters a player em vez de profile (mantendo compat)
alter table public.characters add column if not exists player_id uuid references public.players(id) on delete cascade;

-- 4. RLS permissiva pra MVP (URL = segredo)
alter table public.players enable row level security;
drop policy if exists "players_open" on public.players;
create policy "players_open" on public.players for all using (true) with check (true);

-- Liberar reads/writes nas demais tabelas pra qualquer um com URL da sala
drop policy if exists "campaigns_member_read" on public.campaigns;
drop policy if exists "campaigns_open_read" on public.campaigns;
create policy "campaigns_open_read" on public.campaigns for select using (true);
drop policy if exists "campaigns_open_write" on public.campaigns;
create policy "campaigns_open_write" on public.campaigns for all using (true) with check (true);

drop policy if exists "characters_member_read" on public.characters;
drop policy if exists "characters_owner_write" on public.characters;
drop policy if exists "characters_open" on public.characters;
create policy "characters_open" on public.characters for all using (true) with check (true);

drop policy if exists "sessions_member_read" on public.sessions;
drop policy if exists "sessions_open" on public.sessions;
create policy "sessions_open" on public.sessions for all using (true) with check (true);

drop policy if exists "combat_log_member_read" on public.combat_log;
drop policy if exists "combat_log_open" on public.combat_log;
create policy "combat_log_open" on public.combat_log for all using (true) with check (true);

drop policy if exists "npcs_member_read" on public.npcs;
drop policy if exists "npcs_open" on public.npcs;
create policy "npcs_open" on public.npcs for all using (true) with check (true);

drop policy if exists "locations_member_read" on public.locations;
drop policy if exists "locations_open" on public.locations;
create policy "locations_open" on public.locations for all using (true) with check (true);

drop policy if exists "quests_member_read" on public.quests;
drop policy if exists "quests_open" on public.quests;
create policy "quests_open" on public.quests for all using (true) with check (true);

drop policy if exists "memory_chunks_open" on public.memory_chunks;
create policy "memory_chunks_open" on public.memory_chunks for all using (true) with check (true);

-- 5. Realtime: habilita publicação pra players e sessions
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.sessions;
alter publication supabase_realtime add table public.combat_log;
