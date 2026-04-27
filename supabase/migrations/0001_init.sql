-- ============================================================
-- La Vierta: O RPG - Schema inicial (Etapa 2 do roadmap)
-- ============================================================
-- Aplicar via: Supabase Dashboard → SQL Editor → cole e Run
-- Ou via CLI: supabase db push
-- ============================================================

-- Extensões
create extension if not exists "uuid-ossp";
create extension if not exists "vector";

-- ----------------------------------
-- USERS (vincula a auth.users do Supabase)
-- ----------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  avatar_url text,
  created_at timestamptz default now()
);

-- ----------------------------------
-- CAMPAIGNS (uma por enquanto: "A Maldição de Bruna LaVierta")
-- ----------------------------------
create table if not exists public.campaigns (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  lore_intro text,
  current_chapter int default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.campaign_members (
  campaign_id uuid references public.campaigns(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text default 'player', -- 'player' | 'co_dm' (futuro)
  joined_at timestamptz default now(),
  primary key (campaign_id, user_id)
);

-- ----------------------------------
-- CHARACTERS (1 por jogador por campanha)
-- ----------------------------------
create table if not exists public.characters (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  race text not null,
  class text not null,
  level int default 1,
  -- Atributos
  for_attr int default 10,
  des_attr int default 10,
  con_attr int default 10,
  int_attr int default 10,
  sab_attr int default 10,
  car_attr int default 10,
  -- Stats derivados
  hp_max int default 10,
  hp_current int default 10,
  ac int default 10,
  -- Background
  background text,
  portrait_url text,
  -- Inventory + spells (JSONB)
  inventory jsonb default '[]'::jsonb,
  spells jsonb default '[]'::jsonb,
  features jsonb default '[]'::jsonb,
  -- Meta
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (campaign_id, user_id)
);

-- ----------------------------------
-- SESSIONS (cada noite de jogo)
-- ----------------------------------
create table if not exists public.sessions (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  session_number int not null,
  title text,
  summary text, -- IA gera ao final
  current_location_id uuid,
  current_turn_player_id uuid references public.characters(id),
  in_combat boolean default false,
  music_mood text default 'tavern', -- tavern | dungeon | battle | boss | calm
  started_at timestamptz default now(),
  ended_at timestamptz
);

-- ----------------------------------
-- COMBAT_LOG (event sourcing)
-- ----------------------------------
create table if not exists public.combat_log (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references public.sessions(id) on delete cascade,
  actor_type text not null, -- 'player' | 'npc' | 'dm' | 'system'
  actor_id uuid,
  event_type text not null, -- 'narration' | 'roll' | 'attack' | 'damage' | 'heal' | 'move' | 'speak' | 'spawn' | 'mood_change'
  payload jsonb not null,
  created_at timestamptz default now()
);

create index if not exists combat_log_session_idx on public.combat_log(session_id, created_at);

-- ----------------------------------
-- NPCs (gerados pela IA, persistentes)
-- ----------------------------------
create table if not exists public.npcs (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  name text not null,
  role text, -- ally | enemy | neutral | shopkeeper | quest_giver
  description text,
  portrait_url text,
  location_id uuid,
  alive boolean default true,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- ----------------------------------
-- LOCATIONS (cidades, dungeons descobertas)
-- ----------------------------------
create table if not exists public.locations (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  name text not null,
  description text,
  type text, -- city | dungeon | wilderness | tavern
  parent_location_id uuid references public.locations(id),
  map_image_url text,
  discovered boolean default false,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- ----------------------------------
-- QUESTS
-- ----------------------------------
create table if not exists public.quests (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  title text not null,
  description text,
  status text default 'active', -- active | completed | failed
  reward jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- ----------------------------------
-- MEMORY_CHUNKS (RAG da IA-mestre)
-- ----------------------------------
create table if not exists public.memory_chunks (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  chunk_type text not null, -- 'lore' | 'session_summary' | 'npc_interaction' | 'event' | 'easter_egg'
  content text not null,
  embedding vector(1536),
  importance int default 5, -- 1-10, prioridade na busca
  created_at timestamptz default now()
);

create index if not exists memory_chunks_campaign_idx on public.memory_chunks(campaign_id);

-- ----------------------------------
-- ROW-LEVEL SECURITY
-- ----------------------------------
alter table public.profiles enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.characters enable row level security;
alter table public.sessions enable row level security;
alter table public.combat_log enable row level security;
alter table public.npcs enable row level security;
alter table public.locations enable row level security;
alter table public.quests enable row level security;
alter table public.memory_chunks enable row level security;

-- Profiles: cada um vê e edita o próprio
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

-- Campanhas: membros veem
drop policy if exists "campaigns_member_read" on public.campaigns;
create policy "campaigns_member_read" on public.campaigns for select
  using (exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = campaigns.id and cm.user_id = auth.uid()
  ));

drop policy if exists "campaign_members_self_read" on public.campaign_members;
create policy "campaign_members_self_read" on public.campaign_members for select
  using (user_id = auth.uid() or exists (
    select 1 from public.campaign_members me
    where me.campaign_id = campaign_members.campaign_id and me.user_id = auth.uid()
  ));

-- Personagens: dono edita, membros da mesma campanha leem
drop policy if exists "characters_member_read" on public.characters;
create policy "characters_member_read" on public.characters for select
  using (exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = characters.campaign_id and cm.user_id = auth.uid()
  ));

drop policy if exists "characters_owner_write" on public.characters;
create policy "characters_owner_write" on public.characters for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Sessions, combat_log, npcs, locations, quests, memory: só membros da campanha
drop policy if exists "sessions_member_read" on public.sessions;
create policy "sessions_member_read" on public.sessions for select
  using (exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = sessions.campaign_id and cm.user_id = auth.uid()
  ));

drop policy if exists "combat_log_member_read" on public.combat_log;
create policy "combat_log_member_read" on public.combat_log for select
  using (exists (
    select 1 from public.sessions s
    join public.campaign_members cm on cm.campaign_id = s.campaign_id
    where s.id = combat_log.session_id and cm.user_id = auth.uid()
  ));

drop policy if exists "npcs_member_read" on public.npcs;
create policy "npcs_member_read" on public.npcs for select
  using (exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = npcs.campaign_id and cm.user_id = auth.uid()
  ));

drop policy if exists "locations_member_read" on public.locations;
create policy "locations_member_read" on public.locations for select
  using (exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = locations.campaign_id and cm.user_id = auth.uid()
  ));

drop policy if exists "quests_member_read" on public.quests;
create policy "quests_member_read" on public.quests for select
  using (exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = quests.campaign_id and cm.user_id = auth.uid()
  ));

-- Trigger: criar profile automaticamente ao signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- SEED: campanha inicial
-- ============================================================
insert into public.campaigns (id, name, lore_intro)
values (
  '00000000-0000-0000-0000-000000000001',
  'A Maldição de Bruna LaVierta',
  'No princípio, o reino de Vélreth vivia em harmonia. Até que Bruna, a Pandórica, abriu a Caixa dos Sentimentos Não-Ditos. A Liga dos Quatro da Élite foi convocada para reunir os fragmentos antes que a Maldição da Saudade Infinita consuma o continente.'
)
on conflict (id) do nothing;
