-- ============================================================
-- Migration 0005: Suporte completo a Personagem + Sessão + DM-IA
-- ============================================================

-- 1. Garante que characters tem todos os campos necessários
alter table public.characters add column if not exists portrait_url text;
alter table public.characters add column if not exists race_key text;
alter table public.characters add column if not exists class_key text;
alter table public.characters add column if not exists genero text;

-- Vincula character ao player.id (que já existe)
alter table public.characters add column if not exists player_id uuid references public.players(id) on delete cascade;

-- Index pra lookup rápido por player
create index if not exists characters_player_idx on public.characters(player_id);
create unique index if not exists characters_one_per_player
  on public.characters(campaign_id, user_id)
  where user_id is not null;

-- 2. Tabela message_log: histórico unificado pra IA-mestra
-- (combat_log já existe; vou usar ela)

-- 3. Sessions: garante que existe ao menos uma "sessão atual" pra cada campanha
create or replace function public.get_or_create_current_session(p_campaign_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s_id uuid;
  s_num int;
begin
  -- Procura sessão ativa (não terminou)
  select id into s_id from public.sessions
    where campaign_id = p_campaign_id and ended_at is null
    order by started_at desc limit 1;

  if s_id is not null then
    return s_id;
  end if;

  -- Cria nova sessão
  select coalesce(max(session_number), 0) + 1 into s_num
    from public.sessions where campaign_id = p_campaign_id;

  insert into public.sessions (campaign_id, session_number, music_mood)
  values (p_campaign_id, s_num, 'tavern')
  returning id into s_id;

  return s_id;
end;
$$;

grant execute on function public.get_or_create_current_session(uuid) to anon, authenticated;
