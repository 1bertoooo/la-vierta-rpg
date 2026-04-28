-- 0016 — Mapa tático (Sprint N)
--
-- sessions.combat_map: { width, height, terrain, tokens[] }
-- Tokens: { id, type ('player'|'enemy'|'npc'), nick?, name, portrait_url?, x, y, color, hp_current?, hp_max? }

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS combat_map jsonb NULL;

-- RPC: move_token — admin move qualquer token, player move só o próprio
CREATE OR REPLACE FUNCTION move_token(
  p_session_id uuid,
  p_token_id   text,
  p_x          integer,
  p_y          integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_map jsonb;
  v_tokens jsonb;
  v_new_tokens jsonb;
BEGIN
  SELECT combat_map INTO v_map FROM sessions WHERE id = p_session_id FOR UPDATE;
  IF v_map IS NULL THEN RETURN; END IF;
  v_tokens := COALESCE(v_map->'tokens', '[]'::jsonb);
  v_new_tokens := (
    SELECT jsonb_agg(
      CASE
        WHEN t->>'id' = p_token_id THEN
          t || jsonb_build_object('x', p_x, 'y', p_y)
        ELSE t
      END
    )
    FROM jsonb_array_elements(v_tokens) t
  );
  UPDATE sessions
    SET combat_map = v_map || jsonb_build_object('tokens', COALESCE(v_new_tokens, '[]'::jsonb))
    WHERE id = p_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION move_token(uuid, text, integer, integer) TO authenticated, anon;
