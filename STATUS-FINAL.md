# La Vierta — Status final pós-auditoria BEBETO

9 sprints (A → I), ~13 horas de implementação, 18 cenários simulados, 13 bugs catalogados (12 resolvidos, 1 mitigado), 4 migrations Supabase, 6 commits no Vercel.

## Bugs reportados na mensagem BEBETO — todos resolvidos

| # | Bug | Sprint | Status |
|---|---|---|---|
| 1 | Bebeto rolou pelo Teucu | A | ✅ `[ROLL @nick]` + filtro client + sync server |
| 2 | DM atropela vez dos jogadores | A + B | ✅ Buffer turn-based real, all_acted dispara DM uma vez só |
| 3 | Falas perdidas na narração | A | ✅ Display sincronizado, stripDirectives conservativo |
| 4 | Login não funciona | (Sprint anterior) | ✅ /api/cadastrar com SUPABASE_SERVICE_ROLE_KEY |

## Auditoria de simulação (18 traces) — bugs encontrados

### P0 (críticos, todos fixados)
1. ✅ **Bug 1** Não-admin rola → phase preso 'narrating' (deadlock total). Fix: `complete_round` sem `&& isAdmin`.
2. ✅ **Bug 2** Player desconecta → rodada trava. Fix: `skip_player_in_round` RPC + auto-skip AFK > 90s.
3. ✅ **Bug 3** Solo non-admin → flushRound nunca dispara. Fix: condição `(isAdmin || ativos.length <= 1)`.
4. ✅ **Bug 4** Combate→fora deixa phase preso. Fix: `[COMBATE INICIA/FIM]` força `complete_round`.
5. ✅ **Bug 5** DM falha → state preso. Fix: catch chama `complete_round` (idempotente).

### P1 (sérios, todos mitigados)
6. ✅ **Bug 6** Race useEffect+inline `flushRound`. Fix: `flushRoundInFlightRef`.
7. ✅ **Bug 7** Admin offline → ninguém flusha. Fix: shadow admin (alfabético, 8s grace).
8. ✅ **Bug 8** DM alucina @nick inválido. Fix: prompt agregado lista nicks ativos.
9. ✅ **Bug 9** Aside privacy leak via DB. Fix: tabela `private_asides` com RLS, texto separado do log.
10. ✅ **Bug 10** Re-narração loop. Fix: `lastNarratedRoundRef` idempotência.

### P2 (cosméticos)
11–13. ✅ RodadaBadge transição combate, send action sem session, info messages duplicadas — todos limpos.

## Features adicionadas além de bug fixes

| Feature | Sprint |
|---|---|
| `[ROLL @nick]` com target obrigatório | A |
| DM_CORE bloco TURNOS — Mestre espera rodada completa | A |
| Buffer de ações turn-based real (`pending_actions` JSONB) | B |
| `RodadaBadge` UI: "Rodada N · 2/4 agiram" + avatares ✓/⏳ | B |
| Lifecycle pendingRoll server-side (90s timeout) | B |
| Botão "Pular minha vez" + "Pular jogador" admin | D + F |
| "Forçar fim de rodada" admin emergency | D |
| Roll dramatic preview (todos veem `🎲 bebeto · CON DC 15`) | F |
| Phase stuck warning + "Destravar" admin > 60s | F |
| Aside privado real via tabela RLS | G |
| Input de texto digitável + draft persistente localStorage | G |
| Heartbeat 30s → 15s + visibility change | G |
| Auto-recovery client (admin/shadow) — phase stuck > 90s | H |
| Auto-skip AFK player (last_seen > 90s + collecting > 60s) | H |
| Pre-narration countdown "Mestre tece em 3, 2, 1" | H |
| pg_cron server-side backstop (a cada 1 min, phase > 5min reset) | I |
| Cleanup automático de private_asides > 7 dias | I |

## Migrations Supabase (todas aplicadas)

- 0012 — `pending_actions`, `round_phase`, `round_number`, `pending_roll` + 4 RPCs (submit_action, complete_round, set_pending_roll, clear_pending_roll)
- 0013 — `skip_player_in_round` + `force_complete_round`
- 0014 — `private_asides` table com RLS
- 0015 — pg_cron + `cron_auto_recovery_sessions` agendada a cada 1 min

## Camadas de proteção contra deadlock (defense-in-depth)

A rodada NÃO trava mesmo em vários cenários patológicos:

1. **Layer 1 — Admin direto**: 4ª ação dispara `flushRound` inline.
2. **Layer 2 — Admin reativo**: `useEffect[roundPhase]` dispara em qualquer admin que receber realtime UPDATE.
3. **Layer 3 — Shadow admin**: jogador alfabeticamente primeiro assume após 8s.
4. **Layer 4 — Auto-skip AFK**: admin/shadow cliente cron 30s, pula AFK > 90s automaticamente.
5. **Layer 5 — Auto-recovery client**: phase stuck > 90s força `force_complete_round`.
6. **Layer 6 — pg_cron server**: a cada 1 min, sessions com phase > 5 min são reset (mesmo sem cliente algum online).
7. **Layer 7 — try_lock_dm 60s**: previne calls duplicados.

## Estado atual do jogo

🟢 **La Vierta live**: https://la-vierta-rpg.vercel.app/

Versão 0.3 Alpha · Apenas para a Élite.

Não há bugs P0 ou P1 conhecidos.

## Próximas frentes possíveis (todas opcionais)

- **Mobile UX deep dive** — botão mic maior, gestos, layout responsive especial
- **Round history sidebar** — modal mostrando rodadas anteriores formatadas
- **Edge function /api/dm-trigger** — substitui o pg_cron por trigger reativo a UPDATE de sessions (latência menor)
- **Player presence avatars no header** — quem está digitando, escutando, etc
- **Spotlight tracker visual** — quem foi protagonista das últimas 3 rodadas
- **Combat polish** — review do fluxo de iniciativa, condições, AoE
- **Achievement system** — bordões herdados, comic panel gallery
- **Telemetria** — round duration, DM response time, player engagement metrics
