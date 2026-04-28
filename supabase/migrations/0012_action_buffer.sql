-- 0012 — Action buffer (Sprint B / turn-based real)
--
-- Cada rodada, TODOS os jogadores ativos descrevem suas ações antes do Mestre
-- responder. Implementa o buffer + lifecycle de roll pendente server-side.
--
-- Estados de session.round_phase:
--   'idle'        — sem rodada em curso (estado inicial / após narração)
--   'collecting'  — rodada aberta, jogadores enviando ações
--   'narrating'   — Mestre tecendo a resposta (input bloqueado pra todos)
--   'rolling'     — esperando rolagem do alvo (pendingRoll)
--
-- pending_actions: JSONB array de { player_id, nick, text, ts }
-- pending_roll:    JSONB { target_nick, attr, dc, vantage, expires_at } | null

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS round_number    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS round_phase     text    NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS pending_actions jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pending_roll    jsonb   NULL;

-- Constraint: round_phase válido
DO $$ BEGIN
  ALTER TABLE sessions
    ADD CONSTRAINT round_phase_valid
    CHECK (round_phase IN ('idle','collecting','narrating','rolling'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- RPC: submit_action — adiciona ação no buffer atomicamente.
-- Retorna o novo estado: { phase, count, total, all_acted }
-- Se all_acted=true, client/admin dispara DM.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION submit_action(
  p_session_id uuid,
  p_player_id  uuid,
  p_nick       text,
  p_text       text,
  p_total      integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actions   jsonb;
  v_existing  jsonb;
  v_phase     text;
  v_round     integer;
  v_count     integer;
  v_all       boolean;
BEGIN
  -- Lock pessimista da row pra evitar race
  SELECT pending_actions, round_phase, round_number
    INTO v_actions, v_phase, v_round
    FROM sessions
    WHERE id = p_session_id
    FOR UPDATE;

  -- Se está narrando ou rolando, rejeita
  IF v_phase IN ('narrating','rolling') THEN
    RETURN jsonb_build_object('ok', false, 'reason', v_phase);
  END IF;

  -- Idempotência: mesmo player não pode submeter 2x na mesma rodada
  SELECT a INTO v_existing
    FROM jsonb_array_elements(COALESCE(v_actions, '[]'::jsonb)) a
    WHERE a->>'player_id' = p_player_id::text
    LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_acted');
  END IF;

  -- Adiciona ação
  v_actions := COALESCE(v_actions, '[]'::jsonb) || jsonb_build_object(
    'player_id', p_player_id,
    'nick',      p_nick,
    'text',      p_text,
    'ts',        EXTRACT(EPOCH FROM NOW()) * 1000
  );

  v_count := jsonb_array_length(v_actions);
  v_all   := v_count >= p_total;

  -- Se primeira ação da rodada, abre fase 'collecting' e incrementa round
  IF v_phase = 'idle' THEN
    v_phase := 'collecting';
    v_round := v_round + 1;
  END IF;

  -- Se todos agiram, marca pra narrar
  IF v_all THEN
    v_phase := 'narrating';
  END IF;

  UPDATE sessions
    SET pending_actions = v_actions,
        round_phase     = v_phase,
        round_number    = v_round
    WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'ok',         true,
    'phase',      v_phase,
    'round',      v_round,
    'count',      v_count,
    'total',      p_total,
    'all_acted',  v_all
  );
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- RPC: complete_round — limpa buffer, volta pra idle (chamado após narração)
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION complete_round(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE sessions
    SET pending_actions = '[]'::jsonb,
        round_phase     = 'idle',
        pending_roll    = NULL
    WHERE id = p_session_id;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- RPC: set_pending_roll — Mestre pediu roll, server vira fase 'rolling'
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_pending_roll(
  p_session_id  uuid,
  p_target_nick text,
  p_attr        text,
  p_dc          integer,
  p_vantage     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE sessions
    SET pending_roll = jsonb_build_object(
          'target_nick', p_target_nick,
          'attr',        p_attr,
          'dc',          p_dc,
          'vantage',     p_vantage,
          'expires_at',  EXTRACT(EPOCH FROM NOW() + interval '90 seconds') * 1000
        ),
        round_phase = 'rolling'
    WHERE id = p_session_id;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- RPC: clear_pending_roll — após rolagem ser feita ou expirada
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION clear_pending_roll(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE sessions
    SET pending_roll = NULL,
        round_phase  = CASE WHEN round_phase = 'rolling' THEN 'narrating' ELSE round_phase END
    WHERE id = p_session_id;
END;
$$;

-- Permissões — SECURITY DEFINER + grant
GRANT EXECUTE ON FUNCTION submit_action(uuid, uuid, text, text, integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION complete_round(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION set_pending_roll(uuid, text, text, integer, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION clear_pending_roll(uuid) TO authenticated, anon;

-- Índice pra realtime ver mudanças no array (não estritamente necessário, mas ajuda)
-- supabase já tem realtime no UPDATE de sessions
