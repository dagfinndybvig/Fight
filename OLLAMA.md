# Local AI with Ollama

The Fight arcade can be driven by a local [Ollama](https://ollama.com)
model instead of the TypeSafe Jev API. No API key, no network calls
beyond your own machine — the model runs locally and answers the game's
decision polls.

With Ollama 0.35+ this uses Ollama's native Jev-style decision endpoint
(`/v1/systemone`): the model returns a typed move choice, a real
probability distribution over all legal moves, and a confidence score —
the same interface as Jev, served from your own machine.

## Prerequisites

1. [Node.js](https://nodejs.org) installed (the server uses built-ins
   only — no npm install needed).
2. [Ollama](https://ollama.com) installed and running (it starts
   automatically on most installs).
3. A model pulled, e.g.:

```
ollama pull nimble:latest
```

Any model that supports structured output works; the decision models
(`nimble` from Bespoke Labs, `tev1` and `tev1:0.8b` from Together AI)
are the best fit on Ollama 0.35+. `nimble:latest` (9B,
Q8_0) is what this setup was tested with.

## Starting the server

With Ollama installed and at least one model pulled, just start the
server — it auto-detects the first installed model:

```
node server.js
```

To pick a specific model, set `OLLAMA_MODEL`:

```
# Windows (cmd.exe)
set OLLAMA_MODEL=nimble:latest && node server.js

# Windows (PowerShell)
$env:OLLAMA_MODEL="nimble:latest"; node server.js

# macOS / Linux
OLLAMA_MODEL=nimble:latest node server.js
```

Then open **http://localhost:3000** in your browser. The AI opponent is
active immediately — no key entry needed. Press **0** to toggle autoplay
(the model controls both fighters), or fight the AI yourself.

The startup log confirms the backend:

```
AI backend: Ollama model nimble:latest at http://localhost:11434
```

or, with auto-detection:

```
No API key set; looking for a local Ollama instance...
AI backend: no API key set, using local Ollama model nimble:latest at http://localhost:11434
```

## How it works

The game already polls `POST /jev` every 300ms with a Jev System One
request: a text state plus a choice question over the 15 legal moves.
With `OLLAMA_MODEL` set, the server answers those polls locally in one
of two modes, chosen automatically at startup:

### Native decision mode (Ollama 0.35+, recommended)

Ollama's native `/v1/systemone` endpoint implements TypeSafe's Jev API,
so the server simply forwards the game's request to it:

```
game state → text → POST /jev → Ollama /v1/systemone
           → {choice, real probabilities, real confidence} → fighter moves
```

The model answers with a genuine probability distribution over all 15
moves and a calibrated confidence — exactly the typed response the
game was built for, served from your own machine. The startup probe
reports `Decision mode: native /v1/systemone (Ollama 0.35+)`.

### Chat adapter mode (older Ollama versions, automatic fallback)

On Ollama < 0.35 there is no decision endpoint, so the server adapts:
it builds a chat prompt with a JSON-schema-constrained answer
(`think: false`, 64-token cap), then reshapes the reply into the Jev
response shape. Because a chat model has no real probability
distribution, the server synthesizes a peaked one (0.5 on the chosen
move, the rest spread evenly); the game's temperature sampling
(1.6–2.4) still keeps play varied. The startup probe reports
`Decision mode: chat adapter (no native /v1/systemone)`.

In both modes the server warms the model at startup so the first poll
is not a cold load (a cold load can take tens of seconds and would
cause early fallbacks).

No changes to `game.js` are needed — the game cannot tell the
difference between Jev and the local backend.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `OLLAMA_MODEL` | *(auto-detected)* | Specific model to serve `/jev` from. When set, it takes precedence over the TypeSafe proxy. When unset and no API key is configured, the first installed Ollama model is auto-detected at startup. |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama instance to call (protocol, hostname, and port). Point it at another machine to use a remote Ollama — `https://` is supported. |
| `HOST` | `127.0.0.1` | Network address the game server binds to. Set `0.0.0.0` to play from other devices on your LAN. |

Backend precedence: an explicit `OLLAMA_MODEL` wins, then a configured
`TYPESAFE_API_KEY` (TypeSafe proxy), then auto-detection of the first
installed Ollama model. A browser-supplied key (press **J**) is only
used by the TypeSafe proxy path.

## Verifying

Check the backend and latency without opening the game:

```
curl http://localhost:3000/jevstatus
```

```
{"serverKey":true,"backend":"ollama:nimble:latest","mode":"native"}
```

`mode` is `native` on Ollama 0.35+ and `chat` on older versions.

A full decision poll:

```
curl -X POST http://localhost:3000/jev -H "Content-Type: application/json" -d "{\"model\":\"jev-latest\",\"state\":\"Karate bout. Distance between fighters: 95 pixels. We are at far range.\",\"questions\":{\"action\":{\"type\":\"choice\",\"instructions\":\"Which move should the fighter make right now?\",\"criteria\":[\"approach\",\"retreat\",\"block\",\"jump\",\"punch_high\",\"punch_low\",\"elbow\",\"kick_high\",\"kick_low\",\"sweep\",\"roundhouse\",\"back_kick\",\"jump_kick\",\"jump_round\",\"wait\"]}}}"
```

```
{"answers":{"action":{"choice":"approach","confidence":0.95,"probabilities":{"approach":0.98,"roundhouse":0.005,"kick_high":0.003,...}}}}
```

In native mode the probabilities are the model's real decision
distribution, not a placeholder. Measured latency with `nimble:latest`
after warm-up is ~0.4s per poll, well inside the game's 3s timeout.

## Troubleshooting

- **HUD shows red / "fallback"** — the model is still loading, Ollama is
  not running, or the reply was too slow. The game retries every 300ms
  and recovers automatically once the model responds.
- **`HTTP 502` in the log panel** — the server could not reach Ollama or
  got an invalid reply. Check that Ollama is up
  (`curl http://localhost:11434/api/tags`) and that the model name in
  `OLLAMA_MODEL` matches an installed model exactly. The server console
  shows the backend it is using.
- **Frequent `low conf` fallbacks in native mode** — the confidence
  score is the model's real one and can legitimately dip below the
  game's 0.3 floor on ambiguous situations. Falling back to the
  heuristic AI for those moments is by design; the AI resumes on the
  next confident decision.
- **Fallback after a pause** — Ollama unloads models after ~5 minutes
  idle. The first polls after a break hit a cold load and may time out;
  the game recovers automatically once the model is loaded again.
- **Slow polls** — smaller models (or a lower quantization) respond
  faster. The game falls back to its built-in heuristic AI whenever a
  poll exceeds 3 seconds, so an overloaded machine degrades gracefully
  rather than freezing the fight.
- **Repetitive play** — variety comes from the synthesized probability
  distribution plus the game's temperature sampling. If the model always
  picks the same move, the sampling still varies it, but you can also
  swap in a different `OLLAMA_MODEL`.

## Notes

- Press **L** in-game to watch every decision the model makes: choice,
  confidence, and the distribution it returned.
- `window.jevLog()` in the browser console returns the last 200
  decisions as data.
- The confidence value comes from the model when it supplies one in
  0..1; otherwise it defaults to 0.9. Confidence below the game's 0.3
  floor triggers the heuristic fallback, so a model that reports very
  low confidence will fight erratically.
