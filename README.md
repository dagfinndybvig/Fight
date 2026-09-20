<img width="1624" height="825" alt="fight2" src="https://github.com/user-attachments/assets/df48f75e-25bb-4318-928b-bbc2914609ad" />

# Fight
Inspired by *The Way of the Exploding Fist* (1985): a one-on-one karate
bout with yin-yang scoring. No health bar — a clean hit ends the round.
First to two full yin-yangs wins the bout and advances to a harder stage.
Win all four stages to become the master.

It can be played locally with Jev if you have an API key, but you can also play it online without just to get an impression:
https://dagfinndybvig.github.io/Fight/

Interestingly Jev offers a more varied gameplay than the traditional autoplay, so the payoff is clearly visible.

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

`M` mutes sound, `P` pauses, `J` sets the Jev API key, `L` toggles the
Jev log panel, `0` toggles autoplay.

### Running

**Without Jev (local AI only):** open `index.html` directly in a browser,
or deploy the folder to GitHub Pages. No build step, no external assets.

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

Press **0** to toggle autoplay. When on, Jev controls both fighters —
each with its own independent polling instance, fighting style, and
local heuristic fallback. The bull bonus round is skipped in autoplay.

Each fighter has two distinct fighting styles and randomly switches
between them every 3-7 seconds for variety. Jev's probability
distribution is sampled with a random temperature (1.6-2.4) so fighters
don't always pick the safest move — this produces natural variety in
both autoplay and manual play.

### Jev log

Press **L** during a fight to toggle an on-canvas log panel showing every
Jev decision: which fighter, choice, confidence, stage, and probability
distribution. In the DevTools console, `window.jevLog()` returns the
full 200-entry ring buffer and `window.jevClear()` empties it.

## AI

The machine player uses a local heuristic AI by default. Press **J** to
enter a [Jev](https://www.typesafe.ai) API key (TypeSafe System One model)
for AI-driven decisions. Falls back to local AI when no key, on network
error, or low confidence. See [DESIGN.md](DESIGN.md) for details.

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
- [x] Autoplay mode: Jev controls both fighters
- [x] Fighting styles with random switching and temperature sampling

## Design

Detailed design notes — scoring, move tables, rendering, AI architecture,
and constants — are in [DESIGN.md](DESIGN.md).

## Agentic setup

The AI opponent (and autoplay mode) is driven by
[Jev](https://www.typesafe.ai), TypeSafe's System One model.

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
needs a frontier-model budget; the bottleneck is design, not tokens. It
is the combination of these two economical solutions — a typed
decision model for real-time control and a capable coding agent on a
Pro subscription — that together gives unprecedented power for pocket
money.
