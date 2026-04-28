-- ============================================================
-- Migration 0006: Liberação de RLS pra players + RPC sessão
-- ============================================================
-- Substitui a 0005 (que pode não ter rodado).
-- Permite que qualquer usuário autenticado:
-- - Insira em combat_log (logar ações/falas)
-- - Insira em sessions (criar primeira sessão se não existe)
-- ============================================================

-- 1. combat_log: auth-aware
drop policy if exists "combat_log_admin_write" on public.combat_log;
drop policy if exists "combat_log_open" on public.combat_log;
drop policy if exists "combat_log_auth_write" on public.combat_log;
drop policy if exists "combat_log_select_all" on public.combat_log;

create policy "combat_log_select_all" on public.combat_log for select using (true);
create policy "combat_log_auth_insert" on public.combat_log for insert
  with check (auth.uid() is not null);
create policy "combat_log_admin_modify" on public.combat_log for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "combat_log_admin_delete" on public.combat_log for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 2. sessions: qualquer auth pode criar/ler
drop policy if exists "sessions_admin_write" on public.sessions;
drop policy if exists "sessions_open" on public.sessions;
drop policy if exists "sessions_select_all" on public.sessions;

create policy "sessions_select_all" on public.sessions for select using (true);
create policy "sessions_auth_insert" on public.sessions for insert
  with check (auth.uid() is not null);
create policy "sessions_auth_update" on public.sessions for update
  using (auth.uid() is not null);
create policy "sessions_admin_delete" on public.sessions for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 3. characters: dono edita o próprio (mas players podem ler todos)
-- (já estava OK na 0003, só garantia)

-- 4. Adiciona genero opcional (e race_key/class_key como aliases pra futuro)
alter table public.characters add column if not exists genero text;
alter table public.characters add column if not exists race_key text generated always as (race) stored;
alter table public.characters add column if not exists class_key text generated always as (class) stored;

-- 5. RPC: criar sessão se não existe (idempotente, qualquer um pode chamar)
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
  if auth.uid() is null then
    raise exception 'Precisa estar autenticado';
  end if;

  select id into s_id from public.sessions
    where campaign_id = p_campaign_id and ended_at is null
    order by started_at desc limit 1;

  if s_id is not null then
    return s_id;
  end if;

  select coalesce(max(session_number), 0) + 1 into s_num
    from public.sessions where campaign_id = p_campaign_id;

  insert into public.sessions (campaign_id, session_number, music_mood)
  values (p_campaign_id, s_num, 'tavern')
  returning id into s_id;

  return s_id;
end;
$$;

grant execute on function public.get_or_create_current_session(uuid) to anon, authenticated;

-- 6. Confirma estado
select
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.players where user_id is not null) as players_auth,
  (select count(*) from public.characters) as characters,
  (select count(*) from public.sessions) as sessions;
