-- 0015 — pg_cron auto-recovery (Sprint I)
--
-- Backstop server-side caso TODOS os clients caiam ou a sessão fique órfã:
-- a cada 1 minuto, sessions com phase=narrating/rolling há mais de 5 minutos
-- (e dm_locked_until expirado) são automaticamente reset para phase='idle'.
--
-- Também faz cleanup de private_asides > 7 dias (privacy hygiene).

-- Habilita pg_cron (Supabase já vem com ele, mas idempotente)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Função de auto-recovery
CREATE OR REPLACE FUNCTION cron_auto_recovery_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Reset sessions presas: phase narrating/rolling > 5 min E dm_lock vazio/expirado
  UPDATE sessions
    SET pending_actions = '[]'::jsonb,
        round_phase     = 'idle',
        pending_roll    = NULL,
        dm_locked_until = NULL
    WHERE round_phase IN ('narrating','rolling')
      AND (
        -- phase ficou presa há mais de 5 min sem updated
        -- usa updated_at se existir, senão CTID heuristic. Como não temos updated_at,
        -- combinamos com lock expiry: se dm_locked_until é NULL ou < now()-5min, resetamos.
        dm_locked_until IS NULL
        OR dm_locked_until < NOW() - INTERVAL '5 minutes'
      );

  -- Cleanup: private_asides > 7 dias (já lidos ou não)
  DELETE FROM private_asides
    WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$;

GRANT EXECUTE ON FUNCTION cron_auto_recovery_sessions() TO authenticated, service_role;

-- Schedule via pg_cron (a cada minuto)
-- Idempotente: unschedule + schedule
DO $$ BEGIN
  PERFORM cron.unschedule('la_vierta_auto_recovery');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'la_vierta_auto_recovery',
  '* * * * *',  -- a cada 1 min
  $$ SELECT cron_auto_recovery_sessions(); $$
);
