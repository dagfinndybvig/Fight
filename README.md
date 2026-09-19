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
| Punch | F (or J) |
| Kick | G (or K) |
| Block | hold *away* from the opponent (no attack) |

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
- [ ] Bull bonus round (Mas Oyama single-strike)
- [ ] Replace simple AI with Jev
