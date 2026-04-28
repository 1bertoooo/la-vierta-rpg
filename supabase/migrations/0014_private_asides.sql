-- 0014 — Private asides (Sprint G — Bug 9 real fix)
--
-- Aside é mensagem privada do Mestre pra UM jogador. Antes ficava no
-- combat_log.payload.text com a tag [ASIDE: ...], visível pra todos via realtime.
-- Agora vai pra tabela própria com RLS — apenas o target lê o texto.

CREATE TABLE IF NOT EXISTS private_asides (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  target_nick  text        NOT NULL,    -- nick do alvo (lowercase)
  text         text        NOT NULL,    -- conteúdo do aside
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  read_at      timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_private_asides_session_target
  ON private_asides (session_id, target_nick, created_at DESC);

ALTER TABLE private_asides ENABLE ROW LEVEL SECURITY;

-- RLS: o usuário SÓ vê asides cujo target_nick === seu profile.nick.
-- Profiles tem (id, nick, role).
DROP POLICY IF EXISTS "private_asides_select_own" ON private_asides;
CREATE POLICY "private_asides_select_own" ON private_asides
  FOR SELECT
  TO authenticated
  USING (
    target_nick = LOWER(
      COALESCE(
        (SELECT nick FROM profiles WHERE profiles.id = auth.uid()),
        ''
      )
    )
  );

-- Service role / admin podem inserir
DROP POLICY IF EXISTS "private_asides_insert_service" ON private_asides;
CREATE POLICY "private_asides_insert_service" ON private_asides
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Permite delete pelo target (mark as read / cleanup)
DROP POLICY IF EXISTS "private_asides_delete_own" ON private_asides;
CREATE POLICY "private_asides_delete_own" ON private_asides
  FOR DELETE
  TO authenticated
  USING (
    target_nick = LOWER(
      COALESCE(
        (SELECT nick FROM profiles WHERE profiles.id = auth.uid()),
        ''
      )
    )
  );

-- Habilita realtime na tabela pra clients receberem inserts em tempo real
ALTER PUBLICATION supabase_realtime ADD TABLE private_asides;
