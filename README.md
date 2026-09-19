# Fight
An arcade style fighting game in vanilla Javascript to be played on Pages.

One player is controlled by the machine.

Starting with simple AI, but the aim is to use Jev.

## Gameplay

Inspired by *The Way of the Exploding Fist* (1985): a one-on-one karate
bout scored the traditional *shobu nihon kumite* way. There is no health bar.
Any clean connecting technique ends the round:

- A well-timed, decisive hit scores a full yin-yang (**ippon**, 1 point).
- A glancing hit or a trade scores half a yin-yang (**waza-ari**, 0.5 points).
- A blocked hit does not connect — the round continues.

First to **two full yin-yangs** wins the bout and advances to a harder stage
(faster, more defensive AI). Win all four stages to become the master.

### Controls

| Action | Keys |
| --- | --- |
| Move | Arrow Left / Right (or A / D) |
| Jump | Arrow Up (or W) |
| Crouch | Arrow Down (or S) |
| Punch | F (or V) |
| Kick | G (or K) |
| Block | hold *back* (away) **+ Down** |

Modifiers: hold **Down** for low attacks; **Kick + toward** for a roundhouse;
**Kick in the air** for a jump kick; **Punch in the air** for a jump punch.
`M` mutes sound, `P` pauses.

### Running

Static files only — open `index.html` directly, or serve the folder and deploy
to GitHub Pages. No build step, no external assets (fighters and backgrounds
are drawn on canvas; sound is synthesized with WebAudio).

## Roadmap

- [x] Core bout loop with yin-yang scoring
- [x] 8 moves (high/low punch & kick, roundhouse, jump kick, jump punch, block)
- [x] 4 stages with themed backgrounds and scaling AI
- [x] Jev integration (TypeSafe System One model) with local-AI fallback
- [x] Bull bonus round (Mas Oyama single-strike) after stage 2

## AI: Jev integration

The machine player can be driven by [Jev](https://www.typesafe.ai), TypeSafe's
System One model — a typed decision model that returns a probability-weighted
choice rather than generating text. Press **J** in-game to enter your TypeSafe
API key (stored in localStorage). When a key is present, the game polls Jev
every ~450ms with a compact fight-state description and a `Choice` question
over the fighter's move set. The response sets the AI's current intent until
the next poll.

Fallback is always visible, never silent: no key, a network error, or
confidence below 0.3 falls back to the local heuristic AI, and the HUD shows
which mode is active.
