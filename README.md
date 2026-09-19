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

`M` mutes sound, `P` pauses, `J` sets the Jev API key.

### Running

Static files only — open `index.html` directly, or serve the folder and deploy
to GitHub Pages. No build step, no external assets.

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

## Design

Detailed design notes — scoring, move tables, rendering, AI architecture,
and constants — are in [DESIGN.md](DESIGN.md).
