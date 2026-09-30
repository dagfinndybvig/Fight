# AGENTS.md

Agent-facing reference for this repo. Read this before changing code.
Detailed docs: [README.md](README.md) (overview, running),
[DESIGN.md](DESIGN.md) (mechanics, rendering, AI architecture),
[OLLAMA.md](OLLAMA.md) (local Ollama AI setup).

## What this is

*The Way of the Exploding Fight* — a one-on-one karate game inspired by
the 1985 original. Yin-yang scoring (no health bar): a clean hit ends
the round, first to 2.0 points wins the bout. Four stages, a bull bonus
round after stage 2, and an AI opponent driven either by the TypeSafe
Jev API or a local Ollama model.

```
index.html   — page shell, loads style.css and game.js
style.css    — full-screen canvas, responsive scaling
game.js      — the entire game (single file, ~1500 lines, no dependencies)
server.js    — local Node.js server: static files + AI decision endpoint
OLLAMA.md    — local Ollama AI setup guide
```

## Running and testing

- No build step, no npm dependencies, no external assets. Node
  built-ins only in `server.js`.
- Run `node server.js`, open http://localhost:3000. Opening
  `index.html` as `file://` works for manual play but the AI cannot
  (CORS) — always test AI behavior through the server.
- There is no test suite. Verify changes by:
  - `curl http://localhost:3000/jevstatus` — expect
    `{"serverKey":true,"backend":"ollama:<model>"}` in Ollama mode.
  - `curl -X POST http://localhost:3000/jev ...` — a full decision
    poll; the exact request is in OLLAMA.md.
  - Playing a bout in the browser; press **L** for the decision log,
    `window.jevLog()` in DevTools returns the last 200 decisions.
- `update()` and `draw()` are wrapped in try/catch so the
  requestAnimationFrame loop survives runtime errors — a broken change
  may fail silently. Watch the DevTools console.

## Environment gotchas

- Windows machine. The bash tool runs Git Bash (POSIX paths like
  `/c/Users/...`), not cmd.exe.
- Repo files use CRLF line endings. The edit tool needs exact matches —
  single-line `old_string` is safest; multi-line matches can fail.
- When starting the server from a tool, use forward slashes in the
  command (`node C:/Users/.../server.js`); backslashes get eaten.

## AI pipeline

Every 300ms (`POLL_MS`, `game.js:195`), for each AI-driven fighter:

```
buildState() → text → POST /jev → {choice, confidence, probabilities}
             → temperature sample (1.6-2.4) → button combo → fighter moves
```

- The game sends a Jev System One request:
  `{model:"jev-latest", state, questions:{action:{type:"choice",
  instructions, criteria}}}`.
- `server.js` either proxies `/jev` to `https://api.typesafe.ai/v1/systemone`
  (default) or answers it from a local Ollama model when `OLLAMA_MODEL`
  is set. The game cannot tell the difference — do not couple `game.js`
  to the backend choice.
- `JevAI` is a factory (`create(id, styles)`); two instances exist:
  `JevAI` (p2, AI opponent) and `JevAI.p1` (player, autoplay only), each
  with independent polling state. They share the API key and a 200-entry
  ring-buffer log.

### Gotchas in the AI path

- **`criteria` is an object, not an array** — the game sends
  `{moveName: "description"}`. `server.js` accepts both shapes; keep it
  that way. This caused a real bug once (HTTP 400 → permanent fallback).
- **The game ignores response bodies** — on `!resp.ok` it throws
  `HTTP <status>`, so the log panel shows `HTTP 502`, never the server's
  `ollama_error` detail. Check the server console for the real error.
- **Fallback triggers**: poll exceeds 3s (`AbortController`), HTTP != 2xx,
  or confidence < 0.3 (`CONFIDENCE_FLOOR`, `game.js:196`). The fighter
  then uses the built-in heuristic (`aiControl()`) until a poll succeeds.
- **Ollama unloads models after ~5 minutes idle** — first polls after a
  pause hit a cold load (~27s for nimble:latest) and time out. The game
  recovers automatically; `server.js` warms the model at startup.
- **Sampling rules**: the previous choice is filtered out before
  sampling (never two identical consecutive moves); if probabilities are
  null, the game falls back to argmax. The Ollama backend synthesizes a
  peaked distribution (0.5 on the chosen move, rest spread evenly)
  because an LLM has no real distribution.
- **A browser key (press J) only affects the TypeSafe proxy path**; it
  is ignored by the Ollama backend. `TYPESAFE_API_KEY` env var injects
  the key server-side; `OLLAMA_MODEL` set wins over the TypeSafe proxy.
- **Hosted site (GitHub Pages) has no proxy** — the AI cannot run there;
  the HUD shows "Jev needs local server".

### Ollama backend

- `OLLAMA_MODEL` (e.g. `nimble:latest`) selects the model;
  `OLLAMA_HOST` (default `http://localhost:11434`) selects the instance
  (hostname and port are honored).
- The reply is JSON-schema-constrained (`format`, `think:false`,
  `num_predict:64`) and reshaped into
  `{answers:{action:{choice, confidence, probabilities}}}`.
- Measured latency after warm-up: ~0.4s per poll (nimble:latest, 9B Q8_0).

## Game mechanics essentials

- **Scoring**: ippon 1.0 (decisive hit: `fdist <= reach * 0.55`, or an
  `alwaysIppon` move — elbow, sweep), waza-ari 0.5 (glancing/trade),
  blocked hit scores nothing and stuns the attacker. First to 2.0 wins.
- **Block is a held state** (back + down), not a move. Blocked hits
  negate and stun the attacker.
- **Moves** are defined by startup/active/recovery frames, reach, and
  vertical hitbox — full table in DESIGN.md. Timings are seconds.
- **Jump attacks**: `choiceToAction()` sets only `up` while grounded,
  then `kick`/`toward` once airborne. Firing both at once lets the
  ground kick win and blocks the jump.
- **Direction resolution**: `choiceToAction` uses abstract
  `toward`/`away` flags, resolved to left/right per frame from current
  facing — never pre-compute directions.
- **State machine**: `title → fighting → roundPause → nextOrEnd()` with
  branches for stageClear, bonus round, champion, gameover. Autoplay
  (key **0**) skips the bonus round and drives both fighters.
- **Stages** scale AI difficulty (reaction time 0.52s→0.16s, block
  chance 0.18→0.60, aggression 0.30→0.95 in the heuristic).
- **Fighting styles**: each fighter has two style strings, switched
  every 3-7s; on switch `lastChoice` is cleared to force re-evaluation.

## Key constants (`game.js`)

| Constant | Value |
| --- | --- |
| `GROUND_Y` | 470 |
| `ARENA_L` / `ARENA_R` | 60 / 900 |
| `GRAVITY` / `JUMP_VEL` | 1700 / 660 |
| `WALK` | 168 px/s |
| `POINTS_TO_WIN` | 2.0 |
| `minGap` | 44 px |
| `POLL_MS` | 300 |
| `CONFIDENCE_FLOOR` | 0.3 |
| `LOG_MAX` | 200 |

## Conventions

- Zero dependencies everywhere; fighters, backgrounds, bull, and sensei
  are canvas-drawn; sound is WebAudio-synthesized. Do not add assets.
- Keep README.md, DESIGN.md, OLLAMA.md, and this file in sync when
  changing endpoints, env vars, the AI pipeline, or mechanics.
- Minimal diffs; match existing style (compact, no build tooling).
