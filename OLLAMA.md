# Local AI with Ollama

The Fight arcade can be driven by a local [Ollama](https://ollama.com)
model instead of the TypeSafe Jev API. No API key, no network calls
beyond your own machine — the model runs locally and answers the game's
decision polls.

## Prerequisites

1. [Ollama](https://ollama.com) installed and running (it starts
   automatically on most installs).
2. A model pulled, e.g.:

```
ollama pull nimble:latest
```

Any model that supports structured output works. `nimble:latest` (9B,
Q8_0) is what this setup was tested with.

## Starting the server

Set `OLLAMA_MODEL` when starting the proxy server:

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
(nimble controls both fighters), or fight the AI yourself.

The startup log confirms the backend:

```
AI backend: Ollama model nimble:latest at http://localhost:11434
```

## How it works

The game already polls `POST /jev` every 300ms with a Jev System One
request: a text state plus a choice question over the 15 legal moves.
With `OLLAMA_MODEL` set, the server answers those polls locally:

```
game state → text → POST /jev → Ollama /api/chat (JSON-constrained)
           → {choice, confidence} → synthesized probabilities → fighter moves
```

1. **Request** — the server extracts the state text, the instructions,
   and the list of allowed moves (`criteria`) from the Jev request.
2. **Prompt** — a system message tells the model it is a karate game AI
   and must answer with JSON; the state is sent as the user message.
3. **Constrained output** — Ollama's `format` JSON schema forces the
   reply to `{"choice": <one of the 15 moves>, "confidence": <0..1>}`,
   with `think: false` and a 64-token cap so the reply is fast.
4. **Reshape** — the reply is wrapped in the Jev response shape
   `{answers:{action:{choice, confidence, probabilities}}}`. Because an
   LLM cannot produce a real probability distribution, the server
   synthesizes a peaked one: 0.5 on the chosen move, the remainder
   spread evenly over the others. The game's temperature sampling
   (1.6–2.4) then keeps play varied.
5. **Warm-up** — the server fires one tiny generation at startup so the
   model is loaded into memory before the first poll (a cold load can
   take tens of seconds and would cause early fallbacks).

No changes to `game.js` are needed — the game cannot tell the
difference between Jev and the local backend.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `OLLAMA_MODEL` | *(unset)* | Model name to serve `/jev` from. When set, the Ollama backend takes precedence over the TypeSafe proxy. |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama instance to call (only the port is used). |

`TYPESAFE_API_KEY` still works as before; if both are set, the Ollama
backend wins. A browser-supplied key (press **J**) is only used by the
TypeSafe proxy path.

## Verifying

Check the backend and latency without opening the game:

```
curl http://localhost:3000/jevstatus
```

```
{"serverKey":true,"backend":"ollama:nimble:latest"}
```

A full decision poll:

```
curl -X POST http://localhost:3000/jev -H "Content-Type: application/json" -d "{\"model\":\"jev-latest\",\"state\":\"Karate bout. Distance between fighters: 95 pixels. We are at far range.\",\"questions\":{\"action\":{\"type\":\"choice\",\"instructions\":\"Which move should the fighter make right now?\",\"criteria\":[\"approach\",\"retreat\",\"block\",\"jump\",\"punch_high\",\"punch_low\",\"elbow\",\"kick_high\",\"kick_low\",\"sweep\",\"roundhouse\",\"back_kick\",\"jump_kick\",\"jump_round\",\"wait\"]}}}"
```

```
{"answers":{"action":{"choice":"approach","confidence":1,"probabilities":{"approach":0.5,"retreat":0.0357,...}}}}
```

Measured latency with `nimble:latest` after warm-up is ~0.4s per poll,
well inside the game's 3s timeout.

## Troubleshooting

- **HUD shows red / "fallback"** — the model is still loading, Ollama is
  not running, or the reply was too slow. The game retries every 300ms
  and recovers automatically once the model responds.
- **`ollama_error` in the log panel** — check that Ollama is up
  (`curl http://localhost:11434/api/tags`) and that the model name in
  `OLLAMA_MODEL` matches an installed model exactly.
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
