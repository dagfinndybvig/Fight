<img width="1624" height="825" alt="fight2" src="https://github.com/user-attachments/assets/df48f75e-25bb-4318-928b-bbc2914609ad" />

# Fight
Inspired by *The Way of the Exploding Fist* (1985): a one-on-one karate
bout with yin-yang scoring. No health bar — a clean hit ends the round.
First to two full yin-yangs wins the bout and advances to a harder stage.
Win all four stages to become the master.

It can be played locally with Jev if you have an API key, with a Jev-like local model via [Ollama](https://ollama.com) (no API key needed — see [OLLAMA.md](OLLAMA.md)), or online without any AI just to get an impression:
https://dagfinndybvig.github.io/Fight/

Interestingly Jev offers a more varied gameplay than the traditional autoplay, so the payoff is clearly visible. The game also doubles as a small test harness for Jev-style decision models — see [A test harness for decision models](#a-test-harness-for-decision-models).

### Controls

| Action | Keys |
| --- | --- |
| Move | Arrow Left / Right (or A / D) |
| Jump | Arrow Up (or W) |
| Crouch | Arrow Down (or S) |
| Punch | F (or V) |
| Kick | G (or K) |
| Block | hold *back* (away) **+ Down** |

11 moves total — punch/kick variants, elbow, sweep, roundhouse, back kick,
jump attacks. See [DESIGN.md](DESIGN.md) for the full move list and mechanics.
To drive the AI with a local Ollama model instead of the Jev API, see
[OLLAMA.md](OLLAMA.md).

`M` mutes sound, `P` pauses, `J` sets the Jev API key, `L` toggles the
Jev log panel, `0` toggles autoplay.

### Running

**Without AI (heuristic opponent only):** open `index.html` directly in a browser,
or deploy the folder to GitHub Pages. No build step, no external assets.
For a real AI opponent without an API key, use the Ollama option below.

**With a local Ollama model (no API key needed):** if you have
[Ollama](https://ollama.com) installed, the server can answer the AI
polls from a local model instead of the TypeSafe API. Just start it —
the first installed model is auto-detected:

```
node server.js
```

To pick a specific model, set `OLLAMA_MODEL`:

```
# Windows (cmd.exe)
set OLLAMA_MODEL=nimble:latest && node server.js

# macOS / Linux
OLLAMA_MODEL=nimble:latest node server.js
```

The model is asked for a JSON move choice (constrained to the 15 legal
moves) and the reply is reshaped into the Jev response format, so the
game needs no changes. With Ollama 0.35+ the server instead uses
Ollama's native Jev-style decision endpoint (`/v1/systemone`), which
answers with a real probability distribution and confidence — the
same typed decisions as Jev, locally. The server pre-warms the model
at startup so the first poll is not a cold load. `OLLAMA_HOST`
(default `http://localhost:11434`) points at a different Ollama
instance.

**With Jev AI (verified working):** the TypeSafe API does not send CORS
headers, so browser-to-API calls are blocked. A zero-dependency Node.js
proxy server is included. Run it locally:

```
node server.js
```

Then open **http://localhost:3000** in your browser, press **J**, and
paste your TypeSafe API key (get one at [console.typesafe.ai](https://console.typesafe.ai)).
The key is stored in `localStorage` — press **J** again to change or clear it.

**Environment variable (development / programmatic use / testing):**
instead of pressing J, set `TYPESAFE_API_KEY` before starting the server:

```
# macOS / Linux
TYPESAFE_API_KEY=yourkey node server.js

# Windows (cmd.exe)
set TYPESAFE_API_KEY=yourkey && node server.js

# Windows (PowerShell)
$env:TYPESAFE_API_KEY="yourkey"; node server.js
```

The game detects the server-side key at startup (via `GET /jevstatus`)
and enables Jev without a browser key. A key entered with **J** always
takes precedence. The proxy also works for programmatic use:

```
curl -X POST http://localhost:3000/jev -H "Content-Type: application/json" -d "{\"model\":\"jev-latest\",\"state\":\"...\",\"questions\":{\"action\":{\"type\":\"choice\",\"instructions\":\"...\",\"criteria\":{\"a\":\"option a\"}}}}"
```

The HUD shows the Jev status in the bottom-right corner:
- **green** — Jev is active and driving the AI
- **red** — fallback to local heuristic (no key, network error, or
  confidence below 0.3)

On the hosted site (GitHub Pages) there is no proxy, so Jev cannot run:
pressing **J** warns that it needs local play, and the HUD shows
"Jev needs local server". Run `node server.js` locally to use Jev.

### Autoplay mode

Press **0** to toggle autoplay. When on, the active AI backend (Jev or your
local Ollama model) controls both fighters —
each with its own independent polling instance, fighting style, and
local heuristic fallback. The bull bonus round is skipped in autoplay.

Each fighter has two distinct fighting styles and randomly switches
between them every 3-7 seconds for variety. Jev's probability
distribution is sampled with a random temperature (1.6-2.4) so fighters
don't always pick the safest move — this produces natural variety in
both autoplay and manual play.

### Jev log

Press **L** during a fight to toggle an on-canvas log panel showing every
Jev decision: which fighter, choice, confidence, poll latency, stage, and probability
distribution. In the DevTools console, `window.jevLog()` returns the
full 200-entry ring buffer and `window.jevClear()` empties it.

## AI

The machine player uses a local heuristic AI by default. For AI-driven
decisions you have two options: a local Jev-like model via
[Ollama](https://ollama.com) (no API key — see [OLLAMA.md](OLLAMA.md)),
or the TypeSafe Jev API: press **J** to
enter a [Jev](https://www.typesafe.ai) API key (TypeSafe System One model).
Both fall back to the local heuristic when no backend is configured, on network
error, or low confidence. See [DESIGN.md](DESIGN.md) for details.

Which backend is playing, and how to get it:

| Backend | HUD shows | How to enable |
| --- | --- | --- |
| Ollama decision model (local) | `OLLAMA <model>` | Install [Ollama](https://ollama.com), pull a model, run `node server.js` — auto-detected; set `OLLAMA_MODEL` to pick one |
| TypeSafe Jev (cloud) | `TYPESAFE` | Set `TYPESAFE_API_KEY` before starting the server, or press **J** in-game |
| Built-in heuristic | (AI: local heuristic) | Nothing needed — this is also the automatic fallback |

Precedence: `OLLAMA_MODEL` > `TYPESAFE_API_KEY` > auto-detected Ollama model. With Ollama 0.35+, decisions come from Ollama's native Jev-style `/v1/systemone` endpoint (real probability distributions); older versions use a chat adapter. The HUD label names the active backend so you always know who is playing.

### A test harness for decision models

The fight is a repeatable decision loop: same state format, the same 15
options, one typed question every 300ms — which makes the game a small
bench for Jev-style decision models:

- **Swap models** — set `OLLAMA_MODEL` to compare nimble, `tev1`, or
  `tev1:0.8b` on identical situations; the HUD names the model, Ollama
  version, and decision mode in play.
- **Per-decision telemetry** — press **L** for each fighter's choice,
  confidence, the full probability distribution, and poll latency;
  `window.jevLog()` exports the last 200 decisions as data.
- **Self-play** — autoplay pits the active backend against itself
  (two independent instances, different fighting styles). Equal models
  produce even bouts; a mismatch shows within one round.
- **Strict, visible fallback** — under 0.3 confidence, over 3s, or on
  any error the fighter switches to the built-in heuristic. A weak
  model doesn't freeze the loop; it just fights worse — and the HUD
  goes red while it does.

Measured on the reference machine (nimble 9B, Q8_0, native mode):
~100–130ms per decision warm — inside the 300ms loop, so the AI
re-decides at the game's full cadence. Details in
[OLLAMA.md](OLLAMA.md).

## How it works

Every 300ms, for each Jev-driven fighter:

1. **State** — the game builds a compact text description of the moment:
   scores, distance in pixels, both fighters' stances (crouching,
   airborne, attacking), arena position, whether the opponent is
   attacking, the fighter's last move, and its current fighting style.
2. **Question** — a single `Choice` question with 15 options (the
   available moves) is POSTed to the TypeSafe System One API
   (model `jev-latest`) through the local proxy.
3. **Decision** — Jev returns the chosen move, a probability
   distribution over all 15 options, and a confidence score. No text
   generation — one typed round trip, small enough to fit in a game loop.
4. **Sampling** — the game samples from the distribution with a random
   temperature (1.6–2.4) and never repeats the previous move, so play is
   varied rather than deterministic.
5. **Action** — the sampled choice maps to a button combo (directions,
   punch, kick) resolved against the fighter's current facing, exactly
   as if a key had been pressed.
6. **Fallback** — if confidence is below 0.3, the API times out (3s), or
   errors, the fighter switches to the built-in heuristic AI until Jev
   responds again.

```
game state → text → POST /jev → choice + probabilities + confidence
           → temperature sample → button combo → fighter moves
```

**Footprint** — each poll is ~340 input tokens and output is free, so at
$0.042 per million input tokens even a long bout costs a fraction of a
cent. In autoplay mode, two independent Jev instances poll separately,
each with its own fighting styles (switched every 3–7 seconds), its own
fallback state, and its own decision log entries.

Press **L** in-game to watch it live: every decision, its confidence,
and the distribution Jev returned. In the browser console,
`window.jevLog()` returns the last 200 decisions as data.

## Roadmap

- [x] Core bout loop with yin-yang scoring
- [x] 11 moves with high/low/special variants
- [x] 4 stages with themed backgrounds and scaling AI
- [x] Bull bonus round after stage 2
- [x] Jev integration with local-AI fallback
- [x] CORS proxy server for local Jev play (verified)
- [x] Autoplay mode: the active AI backend controls both fighters
- [x] Fighting styles with random switching and temperature sampling
- [x] `TYPESAFE_API_KEY` env var support (dev, programmatic use, testing)
- [x] Hosted-site warning: Jev requires local play
- [x] Sensei "Fight!" speech bubble at the start of each stage
- [x] Local Ollama AI backend: zero-config auto-detection, native Jev-style
      decisions via `/v1/systemone` (Ollama 0.35+), chat-adapter fallback
- [x] HUD names the active AI backend (OLLAMA / TYPESAFE), including the
      Ollama version and decision mode
- [x] Per-poll latency logging: `duration` in the decision log, shown in
      the **L** panel
- [x] Decision-model test harness framing: model swapping, per-decision
      telemetry, self-play, strict visible fallback
- [x] Measured latency documented (~100-130ms warm, native mode)
- [x] Audit hardening: loopback binding, path-traversal checks, `https://`
      `OLLAMA_HOST`, Unlicense

Open items:

- [ ] Compare decision models in the harness: nimble vs `tev1` vs
      `tev1:0.8b` on the same stages
- [ ] Exercise the chat-adapter fallback against a real pre-0.35 Ollama
      (code-reviewed only)
- [ ] Normalize mixed CRLF/LF line endings across the repo docs

## Design

Detailed design notes — scoring, move tables, rendering, AI architecture,
and constants — are in [DESIGN.md](DESIGN.md).

## Agentic setup

The AI opponent (and autoplay mode) is driven by
[Jev](https://www.typesafe.ai), TypeSafe's System One model — or by a
local Jev-like model via [Ollama](https://ollama.com), which answers the
same decision polls on your own machine (see [OLLAMA.md](OLLAMA.md)).

### Jev

Jev is TypeSafe AI's first public "System One" model. Unlike an LLM,
it does not generate text — it returns typed, probabilistic decisions
designed for software to consume directly. You send it a state (text
describing the current situation) and a set of typed questions (choice,
score, or yes/no); it returns the selected option, a probability
distribution over all options, and a confidence score.

In this game, Jev is asked a `Choice` question with 15 options (the
available moves) every 300ms. It returns which move to make and how
confident it is. The game samples from the full probability distribution
with a random temperature for variety, rather than always taking the
top pick. If confidence is below 0.3 or the API is unreachable, the
game falls back to a local heuristic AI.

Jev is in early access as of September 2026. API keys are available at
[console.typesafe.ai](https://console.typesafe.ai). Pricing is
$0.042 per million input tokens; output is free. The model alias is
`jev-latest` (currently `jev-1.13.0`).

### Coding agent

The code in this repo — the CORS proxy, the Jev integration, the
fighting styles, temperature sampling, autoplay mode, the on-canvas
log panel, the sensei sprite, the 8-bit music, and all debugging —
was written by an AI coding agent running on GLM-5.2 inside
[Mistral Vibe](https://mistral.ai), a CLI-based agentic development
environment. The agent read the codebase, identified bugs, implemented
features, tested iteratively, and pushed commits to this repository.

### Tokenomics

Both sides of this project run on deliberately small budgets. On the
runtime side, Jev's economy is hard to beat for real-time use: output is
free and each decision poll is ~340 input tokens at $0.042 per million,
so a full bout — hundreds of polls — costs a fraction of a cent. On the
development side, the coding agent ran on GLM-5.2 inside Mistral Vibe on
a Pro subscription — a budget solution for a capable-enough model for
this kind of project. Neither the game's runtime AI nor its development
needs a frontier-model; the bottleneck is design, not tokens. It
is the combination of these two economical solutions — a typed
decision model for real-time control and a decent coding agent on a
reasonable subscription — that together gives unprecedented power for pocket
money.

## License

Public domain — see [LICENSE](LICENSE). Do what you want with it.
