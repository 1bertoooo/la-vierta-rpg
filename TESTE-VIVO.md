# Teste vivo — bugs encontrados jogando como bebeto

## 🔥 Bug crítico encontrado

### Bug T1 — DM responde "aguardando os outros" como narração

**Reprodução:**
1. Logado como bebeto na sala `velreth-elite`
2. Player record NÃO criado (acesso sem personagem ainda) → `jogadoresAtivos.length === 0`
3. Digito ação: "Olho a figura encapuzada com cuidado, tentando ver o rosto sob o capuz."
4. Pressiono Enter
5. Sistema vai pelo fallback `if (totalAtivos === 0) { await chamarDM(txt); return; }`
6. DM recebe `[bebeto]: Olho a figura encapuzada...` SEM wrapper de rodada
7. **DM responde literalmente "aguardando os outros"** — seguindo a instrução do DM_CORE: *"Se o sistema te chamou com só 1 ou 2 ações, isso é bug — responda algo curto tipo 'aguardando os outros' e PARE."*

**Impacto:** Solo player NÃO consegue jogar. Mestre fica em loop "aguardando" sem destravar.

**Fix:** No fallback solo do `enviarAcaoTexto`, formatar prompt como rodada completa:
```ts
const wrapper = `[Rodada — solo player]\n@${me.nick}: ${txt}\n\nNarre o resultado.`;
await chamarDM(wrapper, { silent: true });
```
E atualizar DM_CORE pra explicitar que `[Rodada — solo player]` = rodada de 1 (não aguardar).

---

## 🟡 Bugs/observações de gravidade média

### T2 — "LIGA (0 ONLINE)" mesmo com user presente

Heartbeat só atualiza `players.last_seen_at`. Se o user entra na sala sem ter player record (ainda não criou personagem), heartbeat não tem nada pra atualizar → `jogadoresAtivos = []` → "0 online".

**Fix:** Criar player record automaticamente quando user entra em sala (existing behavior em `reloadAll` mas pode estar com bug — investigar).

### T3 — Doom clocks ilegíveis sem hover

Display: `3/6 ●●●○○○ 3/6 ●●●○○○ 0/12 ............ 0/8 ........ 0/6 ......`

Não há label visível indicando qual é Esperança, Sina, Doom, Arco, Situacional. Player precisa adivinhar ou hover.

**Fix:** Adicionar emoji/label inline: `✨ 3/6 ●●●○○○  🩸 3/6 ●●●○○○  💀 0/12  ⚔ 0/8  🔥 0/6`

### T4 — Sem RodadaBadge visível

Como sou solo + sem player record, RodadaBadge nunca aparece (`!emCombate && roundPhase !== "idle"`). Mas não tem feedback visual de "estou agindo, aguarda Mestre".

**Fix:** Mostrar RodadaBadge minimalista mesmo solo (ex: "Mestre tecendo a cena...").

---

## 🎨 Comparação com outros jogos online

| Recurso | La Vierta | Foundry VTT | Roll20 | AI Dungeon | Owlbear Rodeo |
|---|---|---|---|---|---|
| Chat narrativo | ✅ excelente | ✅ | ✅ | ✅ | ⚠️ minimal |
| TTS por NPC | ✅ **único** | ❌ | ❌ | ❌ | ❌ |
| Música ambiente | ✅ auto | ⚠️ manual | ⚠️ manual | ❌ | ⚠️ |
| DM IA | ✅ **único** | ❌ | ❌ | ✅ | ❌ |
| Push-to-talk | ✅ | ❌ | ❌ | ❌ | ❌ |
| Doom clocks | ✅ | ⚠️ via mod | ⚠️ via mod | ❌ | ❌ |
| Comic panels | ✅ | ❌ | ❌ | ❌ | ❌ |
| Char sheet visual | ⚠️ básica | ✅ rica | ✅ rica | ❌ | ❌ |
| Mapa tático | ❌ | ✅ ótimo | ✅ ótimo | ❌ | ✅ ótimo |
| Tokens | ❌ | ✅ | ✅ | ❌ | ✅ |
| Ficha PDF import | ❌ | ✅ | ✅ | ❌ | ❌ |
| Onboarding | ❌ ausente | ⚠️ steep | ⚠️ steep | ✅ smooth | ✅ smooth |

**Pontos fortes únicos do La Vierta:**
- TTS humano por NPC (Bruna meiga-irritante, Sérgio "ó a empatia")
- Mestre IA com voz brasileira (Suassuna + Rosa)
- Música ambiente sincronizada
- Push-to-talk para rodadas mais imersivas
- Comic panels generativos (Pollinations) em momentos charneira
- Doom clocks built-in (Vincent Baker style)
- Asides privados via RLS

**Lacunas vs concorrência:**
- Mapa/tokens — pra combate tático visual
- Char sheet rich (saving throws, conditions, etc)
- Onboarding/tour — primeiro acesso é confuso
- Tutorial in-game

---

## 💡 Melhorias sugeridas (priorizadas)

### P0 — Fix crítico
- **Fix Bug T1** — solo prompt formatado como rodada (não trigger "aguardando")

### P1 — UX significativa
- **Doom clocks com labels** (✨🩸💀⚔🔥) — cada clock identificável de relance
- **Onboarding modal** — primeiro acesso mostra tour: "Aperta mic pra falar, ou digita Enter. Mestre responde quando todos agem. Pergaminhos guardam memórias."
- **Auto-criação de player record** quando user entra em sala (T2 fix)
- **Indicador de "Mestre tecendo" mesmo solo** — feedback claro quando aguardando IA

### P2 — Features novas
- **Mapa tático simples** — grid SVG com tokens dos players. Drag-drop em combate.
- **Char sheet rica** — saving throws, conditions visíveis, spell slots, death saves UI
- **Quick reference dos doom clocks** — modal explicando cada um
- **Combat board** — turn order + HP bars visíveis sempre durante combate
- **Recap automático** — botão "Resumo da última sessão" que usa o Cronista pra recapping

### P3 — Polish
- **Stickers/emoji reactions** no chat (player reage à narração com 😱❤️🔥)
- **Theme switcher** — alternativas pro pergaminho/vinho atual
- **Modo zen** — full-screen sem header/sidebar pra imersão máxima
- **Compartilhar momento** — botão exporta narração + comic panel como imagem pra postar
