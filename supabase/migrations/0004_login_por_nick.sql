-- ============================================================
-- La Vierta: Login por nick + senha (não email)
-- ============================================================
-- - Cadastro gera email sintético <nick>@lavierta.app
-- - Login traduz nick → email via RPC pública e usa signInWithPassword
-- - Limpa players órfãos (sem user_id) que sobraram da fase anônima
-- ============================================================

-- 1. RPC: traduzir nick em email (executável por anon/authenticated)
create or replace function public.email_by_nick(p_nick text)
returns text
language sql
security definer
set search_path = public
as $$
  select email
  from public.profiles
  where lower(nick) = lower(p_nick)
  limit 1;
$$;

grant execute on function public.email_by_nick(text) to anon, authenticated;

-- 2. Limpa players sem user_id (anônimos da fase antiga)
delete from public.players where user_id is null;

-- 3. Confirma estado pós-migration
select
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.players) as players,
  (select count(*) from public.players where user_id is null) as orphans;
