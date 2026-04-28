-- ============================================================
-- Migration 0010: Doom Clocks (Vincent Baker / John Harper)
-- 3 clocks vivos sempre: doom global, arco, situacional.
-- IDEMPOTENTE.
-- ============================================================

alter table public.sessions
  add column if not exists doom_clocks jsonb default '{
    "doom":         {"max": 12, "current": 0, "label": "A Vierta acorda"},
    "arco":         {"max": 8,  "current": 0, "label": "Arco atual"},
    "situacional":  {"max": 6,  "current": 0, "label": "Pressão imediata"}
  }'::jsonb;

select 'OK — doom_clocks adicionado em sessions' as status;
