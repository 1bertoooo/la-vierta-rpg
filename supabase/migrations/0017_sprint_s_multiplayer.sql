-- Sprint S — fixes multiplayer (R1, R2, R4)
--
-- R1/R2: reset_campaign agora limpa players órfãos (não-admin) também.
-- R1: REPLICA IDENTITY FULL em combat_log e players pra o realtime DELETE
--     enviar payload.old.id (sem isso, DELETE chega vazio e o handler
--     no client não consegue remover do array local).

ALTER TABLE public.combat_log REPLICA IDENTITY FULL;
ALTER TABLE public.players REPLICA IDENTITY FULL;

-- Atualiza reset_campaign pra varrer players non-admin também
CREATE OR REPLACE FUNCTION public.reset_campaign(campaign_uuid uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  is_admin boolean;
BEGIN
  -- Verifica se chamador é admin
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ) INTO is_admin;

  IF NOT is_admin THEN
    RAISE EXCEPTION 'Apenas admins podem resetar campanhas';
  END IF;

  -- Deleta dados de progresso
  DELETE FROM public.combat_log WHERE session_id IN (
    SELECT id FROM public.sessions WHERE campaign_id = campaign_uuid
  );
  DELETE FROM public.private_asides WHERE session_id IN (
    SELECT id FROM public.sessions WHERE campaign_id = campaign_uuid
  );
  DELETE FROM public.combat_initiative WHERE session_id IN (
    SELECT id FROM public.sessions WHERE campaign_id = campaign_uuid
  );
  DELETE FROM public.sessions WHERE campaign_id = campaign_uuid;
  DELETE FROM public.npcs WHERE campaign_id = campaign_uuid;
  DELETE FROM public.locations WHERE campaign_id = campaign_uuid;
  DELETE FROM public.quests WHERE campaign_id = campaign_uuid;
  DELETE FROM public.memory_chunks WHERE campaign_id = campaign_uuid;
  DELETE FROM public.characters WHERE campaign_id = campaign_uuid;
  -- Sprint S R2: limpa player records de não-admins (mantém o player do admin
  -- pra ele continuar com presence). Profiles de outros não são apagados —
  -- só o vínculo player↔campaign.
  DELETE FROM public.players
    WHERE campaign_id = campaign_uuid
      AND user_id NOT IN (SELECT id FROM public.profiles WHERE role = 'admin');

  -- Reset chapter
  UPDATE public.campaigns SET current_chapter = 1, updated_at = now() WHERE id = campaign_uuid;

  RETURN json_build_object(
    'success', true,
    'campaign_id', campaign_uuid,
    'reset_at', now()
  );
END;
$$;
