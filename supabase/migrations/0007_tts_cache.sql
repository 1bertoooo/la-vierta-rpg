-- ============================================================
-- Migration 0007: Bucket de cache TTS
-- ============================================================
-- Armazena áudios gerados pelo OpenAI TTS pra reuso por todos os jogadores.
-- Reduz custo de N → 1 quando vários ouvem a mesma narração.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tts-cache',
  'tts-cache',
  true,
  10485760, -- 10MB por arquivo
  array['audio/mpeg', 'audio/mp3']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = array['audio/mpeg', 'audio/mp3'];

-- Policies: anon pode ler e escrever (URL contém hash do texto, não tem como adivinhar)
drop policy if exists "tts_cache_anon_select" on storage.objects;
drop policy if exists "tts_cache_anon_insert" on storage.objects;
drop policy if exists "tts_cache_anon_update" on storage.objects;

create policy "tts_cache_anon_select" on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'tts-cache');

create policy "tts_cache_anon_insert" on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'tts-cache');

create policy "tts_cache_anon_update" on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'tts-cache')
  with check (bucket_id = 'tts-cache');
