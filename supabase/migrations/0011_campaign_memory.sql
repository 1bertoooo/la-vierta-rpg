-- ============================================================
-- Migration 0011: Memória de campanha (sumário rolante)
-- Resolve "voice drift" do LLM — depois de 30+ turns, IA esquece NPCs,
-- decisões, callbacks. Sumário automático rejuvenesce o contexto.
-- IDEMPOTENTE.
-- ============================================================

alter table public.sessions
  add column if not exists summary text default '';
alter table public.sessions
  add column if not exists summary_updated_at timestamptz;
alter table public.sessions
  add column if not exists summary_event_count int default 0;

select 'OK — campaign memory adicionado em sessions' as status;
