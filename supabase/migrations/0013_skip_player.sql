-- 0013 — Skip player + force flush (Sprint D)
--
-- skip_player_in_round — admin pula player que desconectou ou tá AFK.
-- Adiciona uma "ação fantasma" pelo player (texto vazio) que conta no buffer.
-- Se com isso atinge total, vira phase=narrating.
--
-- force_complete_round — admin emergency: limpa buffer SEM chamar Mestre.

CREATE OR REPLACE FUNCTION skip_player_in_round(
  p_session_id uuid,
  p_player_id  uuid,
  p_nick       text,
  p_total      integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actions  jsonb;
  v_existing jsonb;
  v_phase    text;
  v_round    integer;
  v_count    integer;
  v_all      boolean;
BEGIN
  SELECT pending_actions, round_phase, round_number
    INTO v_actions, v_phase, v_round
    FROM sessions
    WHERE id = p_session_id
    FOR UPDATE;

  IF v_phase IN ('narrating','rolling') THEN
    RETURN jsonb_build_object('ok', false, 'reason', v_phase);
  END IF;

  -- Já agiu? não duplica
  SELECT a INTO v_existing
    FROM jsonb_array_elements(COALESCE(v_actions, '[]'::jsonb)) a
    WHERE a->>'player_id' = p_player_id::text
    LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_acted');
  END IF;

  v_actions := COALESCE(v_actions, '[]'::jsonb) || jsonb_build_object(
    'player_id', p_player_id,
    'nick',      p_nick,
    'text',      '(observa em silêncio)',
    'ts',        EXTRACT(EPOCH FROM NOW()) * 1000,
    'skipped',   true
  );

  v_count := jsonb_array_length(v_actions);
  v_all   := v_count >= p_total;

  IF v_phase = 'idle' THEN
    v_phase := 'collecting';
    v_round := v_round + 1;
  END IF;
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

CREATE OR REPLACE FUNCTION force_complete_round(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE sessions
    SET pending_actions = '[]'::jsonb,
        round_phase     = 'idle',
        pending_roll    = NULL,
        dm_locked_until = NULL
    WHERE id = p_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION skip_player_in_round(uuid, uuid, text, integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION force_complete_round(uuid) TO authenticated, anon;
