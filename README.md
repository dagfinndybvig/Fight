<img width="1586" height="822" alt="fight" src="https://github.com/user-attachments/assets/1197f554-3891-4c78-8b92-cbc871c1cbd0" />

# Fight
An arcade style fighting game in vanilla Javascript to be played on Pages.

One player is controlled by the machine.

Starting with simple AI, but the aim is to use Jev.

## Gameplay

Inspired by *The Way of the Exploding Fist* (1985): a one-on-one karate
bout with yin-yang scoring. No health bar — a clean hit ends the round.
First to two full yin-yangs wins the bout and advances to a harder stage.
Win all four stages to become the master.

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
Jev log panel.

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

The HUD shows the Jev status in the bottom-right corner:
- **green** — Jev is active and driving the AI
- **yellow** — query in flight (brief, ~70-500ms per poll)
- **red** — fallback to local heuristic (no key, network error, or
  confidence below 0.3)

Press **L** during a fight to toggle an on-canvas log panel showing every
Jev decision: choice, confidence, stage, and probability distribution. In
the DevTools console, `window.jevLog()` returns the full 200-entry
ring buffer and `window.jevClear()` empties it.

## AI

The machine player uses a local heuristic AI by default. Press **J** to
enter a [Jev](https://www.typesafe.ai) API key (TypeSafe System One model)
for AI-driven decisions. Falls back to local AI when no key, on network
error, or low confidence. See [DESIGN.md](DESIGN.md) for details.

## Roadmap

- [x] Core bout loop with yin-yang scoring
- [x] 11 moves with high/low/special variants
- [x] 4 stages with themed backgrounds and scaling AI
- [x] Bull bonus round after stage 2
- [x] Jev integration with local-AI fallback
- [x] CORS proxy server for local Jev play (verified)

## Design

Detailed design notes — scoring, move tables, rendering, AI architecture,
and constants — are in [DESIGN.md](DESIGN.md).
