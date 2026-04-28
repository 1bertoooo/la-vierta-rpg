# Simulação de Rodadas — Bugs encontrados

Fiz 18 traces detalhados do fluxo turn-based. Encontrei **5 bugs P0** (quebram o jogo), **5 P1** (UX ruim/edge cases) e **3 P2** (cosméticos), além de **9 melhorias** de jogabilidade.

---

## 🔥 P0 — Bugs que quebram o jogo

### Bug 1 — Não-admin rola e Mestre narra resultado: phase fica preso em "narrating"

**Trace:**
1. Mestre pede `[ROLL: SAB DC 15 @bebeto]`. `set_pending_roll` → phase=`rolling`.
2. Bebeto (não-admin) clica Rolar. `rolarDado` chama `clear_pending_roll` → phase vira `narrating`.
3. Bebeto chama `chamarDM(prompt, { silent: true })` com o resultado.
4. DM responde narrando o resultado (sem novo roll).
5. `chamarDM` no fim: `if (!emCombate && !pediuRoll && sessionId && isAdmin) complete_round()` → **bebeto NÃO é admin**, skip.
6. **Phase fica em `narrating` PERMANENTEMENTE.** Próxima ação retorna `ok=false, reason='narrating'`. **DEADLOCK total.**

**Onde:** `app/sala/[code]/page.tsx`, dentro de `chamarDM` na seção pós-resposta. A condição `&& isAdmin` no `complete_round` não cobre o caso de quem-fez-o-call.

**Fix:** quem fez a `chamarDM` deve fechar a rodada — não exigir ser admin. O lock já protege contra duplicate.

---

### Bug 2 — Player desconecta no meio da rodada: trava infinitamente

**Trace:**
1. 4 players A B C D. A B C agem. count=3.
2. D perde wifi.
3. `jogadoresAtivos = players.last_seen_at > 5min`. D foi visto há 4min → ainda conta como ativo.
4. `totalAtivos=4`, `count=3`. Nunca chega em `all_acted=true`.
5. A B C estão bloqueados por `jaAgiNestaRodada`. Não conseguem agir de novo.
6. Após 5min, jogadoresAtivos cai pra 3, mas pending_actions já tem A B C — `count=3 >= total=3` só seria avaliado se ALGUÉM submetesse uma 4ª ação, e ninguém pode.

**Fix:** botão "Pular jogador inativo" (admin) que chama `clear_inactive_player_action(player_id)` — remove do total esperado E dispara avaliação de all_acted. Adicional: server-side cron que recalcula `total_ativos` baseado em `last_seen_at` a cada 30s.

---

### Bug 3 — Solo player NÃO-admin: nunca dispara DM

**Trace:**
1. 1 player ativo, é viajante (não admin). `totalAtivos=1`.
2. Age. `submit_action` p_total=1. count=1. `all_acted=true`. phase=`narrating`.
3. `if (result.all_acted && isAdmin) flushRound()` — **não sou admin**, skip.
4. `useEffect [roundPhase, isAdmin]`: `if (!isAdmin) return`. Skip também.
5. **Ninguém chama flushRound. Deadlock.**

**Fix:** trocar `&& isAdmin` por `&& (isAdmin || jogadoresAtivos.length === 1)`. Solo player é admin de fato da sua sessão.

---

### Bug 4 — Transição combate → fora-de-combate deixa phase preso em "narrating"

**Trace:**
1. Rodada normal (4 ações). DM responde com `[COMBATE INICIA] [INITIATIVE]`.
2. `pediuInit=true`, então `pediuRoll=true`. `complete_round` skip.
3. Phase fica em `narrating` (set por submit_action). pending_actions=[A,B,C,D].
4. Combate acontece (turns linear via `current_turn_player_id`, buffer bypassed).
5. `[COMBATE FIM]` chega. `in_combat=false`.
6. Próxima ação fora-de-combate: `submit_action` → server `IF v_phase IN ('narrating','rolling') return ok=false`.
7. **Phase nunca foi limpa. Buffer preso. DEADLOCK.**

**Fix:** ao entrar em combate, server-side `complete_round` automático (tipo `[combat] start` listener no client admin chama). Ou: quando sai de combate, reset round.

---

### Bug 5 — DM falha (timeout/erro) durante flushRound: state server preso

**Trace:**
1. Admin chama flushRound. chamarDM → `/api/dm` retorna 500 ou timeout.
2. catch logs error system event. `setAguardandoIA(false)`. `release_dm_lock`.
3. **Phase ainda=`narrating`. pending_actions ainda tem 4 ações.** Server nunca foi limpo.
4. Próxima tentativa: submit_action → reason='narrating'. Bloqueado.

**Fix:** no catch da `chamarDM`, se foi flushRound (não silent? não — silent é flushRound. Diferenciar via opt nova `wasFlush`), chamar `complete_round` ou setar phase de volta pra `collecting` pra retry.

---

## ⚠️ P1 — Sérios mas não bloqueiam totalmente

### Bug 6 — Race: useEffect [roundPhase] dispara flushRound concorrentemente com inline call

**Trace:**
1. A é admin, é o 4º a agir. `submit_action` retorna `all_acted=true`.
2. Realtime UPDATE chega em A: phase=`narrating`. **antes** de A executar `flushRound()` inline.
3. `useEffect [roundPhase, isAdmin]` dispara em A. Verifica condições → chama `flushRound()`.
4. Inline também chama `flushRound()`. Race.
5. Try_lock_dm: um vence, outro recebe `locked=false` e loga "Mestre já está invocando outra cena".
6. **Result:** mensagem "info" duplicada no chat. Não-fatal mas feio.

**Fix:** ref `flushRoundInFlight` que vira true antes de chamar e false após retornar. Evita double-call no mesmo client.

---

### Bug 7 — Admin offline = ninguém flusha = deadlock

**Trace:**
1. 4 players agem. all_acted=true. **Admin desconectou antes**.
2. Não-admin que foi o 4º: `if (isAdmin) flushRound()` — skip.
3. useEffect [roundPhase, isAdmin] em todos os clients: só admin dispara.
4. **Admin offline = ninguém. Phase=narrating preso até admin voltar.**

**Fix:** fallback elege "shadow admin" (jogador com user_id mais antigo presente). Se o "real" admin não responder em 30s, o shadow assume e dispara flushRound.

---

### Bug 8 — Roll target inválido (Mestre alucina @lyanna)

**Trace:**
1. DM pede `[ROLL: SAB DC 15 @lyanna]` (lyanna é nome de personagem, não nick).
2. set_pending_roll com target='lyanna'. phase=rolling.
3. **Nenhum player tem nick=lyanna.** Botão Rolar não aparece pra ninguém.
4. 90s depois: client com pendingRoll set chama clear_pending_roll. Phase volta pra narrating. Mas e o pending_actions? Ainda tem 4 ações.
5. useEffect [roundPhase, isAdmin] dispara em admin → flushRound. **Re-narra a mesma rodada.** Possível loop infinito.

**Fix:** validar target no client (cruzar com lista de nicks dos players ativos). Se inválido, ignorar ou pedir DM novamente. E no flushRound, checar se já narrou essa rodada (idempotência por round_number).

---

### Bug 9 — Aside "privado" não é realmente privado (privacy leak via DB)

**Trace:**
1. DM emite `[ASIDE bebeto: tu nota a tatuagem...]`.
2. Client: filter `if (d.target.toLowerCase() !== myNick) break;` — apenas bebeto vê o modal.
3. **Mas:** o texto da narração com a tag `[ASIDE ...]` está em `combat_log.payload.text`, visível via realtime pra TODOS os clients. Yumi pode abrir DevTools, ver o evento, ler o aside do bebeto.
4. **Privacy leak.** Pode quebrar tensão narrativa.

**Fix:** server-side filter — substituir aside por broadcast direto no canal do target (`channel.send({ event: "aside-private", payload: { text } })`) sem persistir o texto no DB. OU criar tabela `private_messages (target_id, text)` com RLS que só o target lê.

---

### Bug 10 — Após roll completar, useEffect admin re-narra rodada

**Trace:**
1. Rodada 7: 4 ações. flushRound → DM pede `[ROLL @bebeto]`. set_pending_roll, phase=rolling.
2. Bebeto rola. clear_pending_roll → phase=narrating.
3. Bebeto chama chamarDM com resultado. DM narra. Bebeto não-admin → complete_round skip (Bug 1).
4. Bug 1 leva pra cá: phase=narrating com pending_actions ainda intacto.
5. useEffect admin dispara → flushRound → re-narra a rodada inteira **DE NOVO**.

**Fix:** combo do Bug 1 + idempotência por round_number. flushRound checa `if (lastNarratedRound === round) skip`.

---

## 📌 P2 — Cosméticos

### Bug 11 — RodadaBadge desaparece em combate mesmo se phase != idle

`!emCombate && roundPhase !== "idle"` — em combate, badge some. Mas se phase server-side ainda é narrating (resíduo de Bug 4), badge some mascarando o problema.

### Bug 12 — Send action sem session_id: silent fail

`enviarAcaoTexto`: `if (!sessionId || !me?.id) return;` — silent return, player não entende por que não enviou.

### Bug 13 — Mensagens "Mestre já está invocando" duplicam

Bug 6 cria duplicate "info" message. UX poluída.

---

## 💡 Melhorias de jogabilidade

1. **Botão "pular minha vez"** — player não quer agir, marca skip. Conta como ação no buffer com `{ text: "(observa em silêncio)" }`. DM sabe respeitar e narrar com 1 frase passiva.

2. **Botão admin "forçar fim de rodada"** — emergência. Limpa pending sem chamar DM. Útil pra fix de bugs.

3. **Heartbeat agressivo + auto-skip de inativos** — server cron a cada 30s recalcula `last_seen` e ajusta `total_ativos` automaticamente.

4. **Indicador "Mestre vai falar em X segundos"** — após all_acted, countdown de 2s pra player ainda mudar de ideia (cancel + edit). Reduz frustração.

5. **Draft persistente do input** — se player digita ação e desconecta/recarrega, texto não some (localStorage).

6. **Auto-flush solo** — se jogadoresAtivos.length === 1, chamarDM direto sem buffer.

7. **Roll target validation client-side** — se Mestre marcar @nick inválido, mostrar warning ao admin pra resolver manualmente (e.g., "Mestre marcou @lyanna mas só temos bebeto/yumi/teucu/nelson — pular?").

8. **"Phase stuck" warning** — se phase ≠ idle por > 60s sem progresso, mostra warning amarelo no badge: "Algo parece travado. Admin: clica aqui pra resetar."

9. **Round history sidebar** — pequeno painel mostrando rodadas anteriores: "Rodada 6: bebeto bebeu tinta · yumi observou · ... → Mestre: 'A taverna engolira o silêncio.'" — útil pro DM lembrar contexto e pros players reverem.

10. **Roll dramatic preview** — quando set_pending_roll dispara, todos os clients (não só target) veem um overlay sutil "Aguardando rolagem de Bebeto · CON DC 15 ·". Cria suspense, ensina os outros que tipo de teste é, e marca claramente quem está com o spotlight.

11. **Server-side trigger pra flushRound** — em vez do useEffect client, criar Postgres trigger ou edge function que chama `/api/dm` server-side quando phase muda pra `narrating`. Elimina race conditions e dependência de admin online.

12. **Aside via broadcast channel privado** — não persistir aside no combat_log. Usar channel `private:${target_id}` direto. Resolve privacy leak.

---

## Plano de fix (priorizado)

**Sprint D — fix dos P0 (essencial, ~2-3h):**
- Bug 1: tirar `&& isAdmin` da condição de `complete_round` em chamarDM, OU adicionar logic "quem chamou DM fecha rodada".
- Bug 3: condição `(isAdmin || jogadoresAtivos.length === 1)` no flushRound trigger.
- Bug 4: ao iniciar combate (`[COMBATE INICIA]`), forçar `complete_round`. Ao sair, idem.
- Bug 5: catch em chamarDM faz cleanup do server state se era flushRound.
- Bug 2: botão "pular jogador" no admin sidebar.

**Sprint E — fix dos P1 (~2h):**
- Bug 6: ref `flushRoundInFlight` pra anti-race no client.
- Bug 7: shadow admin election (jogador mais antigo).
- Bug 8: validar target no client + flushRound idempotente por round_number.
- Bug 9: aside via private broadcast channel (não persistir DB).
- Bug 10: combo do Bug 1 mata.

**Sprint F — quick wins de UX (~3h):**
- Botão "pular minha vez" (item 1).
- Auto-flush solo (item 6).
- Roll dramatic preview (item 10).
- Phase stuck warning (item 8).

**Sprint G — polish (~2h):**
- Botão admin "forçar fim de rodada" (item 2).
- Draft persistente do input (item 5).
- Round history sidebar (item 9).
- Roll target validation com warning (item 7).
- Heartbeat agressivo (item 3).

**Sprint H — server-side (refactor, ~4h):**
- Postgres trigger ou edge function pra flushRound (item 11).
- Aside via private broadcast channel server-side (item 12).
