# Design

Detailed design notes for *The Way of the Exploding Fight*.

## Inspiration

Based on [The Way of the Exploding Fist](https://en.wikipedia.org/wiki/The_Way_of_the_Exploding_Fist)
(1985, Beam Software / Melbourne House), one of the earliest one-on-one
fighting games. Key mechanics borrowed from the original:

- Yin-yang scoring (*shobu nihon kumite*) instead of health bars.
- A single clean hit ends the round — not a damage race.
- Progression through stages with a watching sensei.
- A bull bonus round (Mas Oyama single-strike feat).

## Scoring

No health bar. Every connecting technique ends the round:

| Outcome | Score | Condition |
| --- | --- | --- |
| Ippon | 1.0 | Well-timed, decisive hit (`fdist <= reach * 0.55`) or an `alwaysIppon` move |
| Waza-ari | 0.5 | Glancing hit or simultaneous trade |
| No connection | 0 | Blocked hit — round continues |

First to **2.0 points** (two full yin-yangs) wins the bout and advances.

### Hit resolution

`resolveHit(atk, def)` checks during the attacker's active frames:

1. **Horizontal**: `fdist` (attacker-facing distance) must be in `[30, reach + 8]`.
2. **Vertical**: attacker hitbox `hb` must overlap the defender body box (`dH = 110` standing, `60` crouching).
3. **Block**: if defender is in block state, the hit is negated — attacker gets stunned.
4. **Scoring**: trades always give 0.5; `alwaysIppon` moves always give 1.0; otherwise based on spacing.

## Move set

11 moves, each defined by startup/active/recovery frames, reach, vertical
hitbox, and a pose name.

| Move | Input | Startup | Active | Recovery | Reach | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Punch high | F | 0.06 | 0.04 | 0.16 | 50 | Default punch |
| Punch low | Down + F | 0.06 | 0.04 | 0.16 | 48 | Body-level |
| Elbow | Toward + F | 0.04 | 0.05 | 0.18 | 38 | Always ippon, very short range |
| Kick high | G | 0.10 | 0.05 | 0.24 | 68 | Head height |
| Kick low | Down + G | 0.10 | 0.05 | 0.24 | 62 | Leg height |
| Sweep | Down + Back + G | 0.18 | 0.06 | 0.36 | 64 | Always ippon, very slow |
| Roundhouse | Toward + G | 0.16 | 0.06 | 0.32 | 76 | Wide arc |
| Back kick | Back + G | 0.12 | 0.06 | 0.26 | 70 | Spacing tool |
| Jump kick | G (in air) | 0.08 | 0.06 | 0.20 | 64 | Airborne |
| Jump roundhouse | Toward + G (in air) | 0.10 | 0.07 | 0.22 | 72 | Wider air hitbox |
| Jump punch | F (in air) | 0.05 | 0.04 | 0.14 | 46 | Fast air attack |
| Block | Back + Down | — | — | — | — | Negates incoming hits |

All timings in seconds. Block is not a move — it's a held state.

## Fighter rendering

Fighters are drawn entirely on canvas — no sprite assets. The rendering
pipeline:

1. **Ground shadow** — elliptical, fades with jump height.
2. **Back limbs** — darker shade for depth. IK-solved 2-bone legs and arms.
3. **GI jacket** — filled trapezoid (wider at shoulders, narrow at hips) with V-neck lapel.
4. **Belt** — colored per fighter (yellow = player, black = AI) with knot and tails.
5. **Front limbs** — normal shade, IK-solved. Bare skin on forearms and shins.
6. **Head** — hair, headband (red = AI, teal = player) with trailing tail, eye.

### IK skeleton

Each limb is two segments (thigh+shin, upper arm+forearm) solved by
`solveIK()` — a standard 2-bone analytic IK that computes the knee/elbow
position given hip/shoulder and foot/hand targets. The `bend` parameter
controls which way the joint flexes:

- Front leg knee bends forward (over toes).
- Back leg knee bends backward (opposite side).
- Front arm elbow tucks inward.
- Back arm elbow flares outward.

### Pose blending

`blendPose()` lerps the current pose toward the target pose each frame.
Attack poses blend faster (rate 0.55) than idle/walk (rate 0.28) for snappy
animations.

## Stages

| Stage | Theme | AI behavior |
| --- | --- | --- |
| 1 | Dojo (warm wood interior) | Slow reactions, low aggression, rarely blocks |
| 2 | Snow (mountains, cold palette) | Moderate |
| 3 | Buddha (statue silhouette, dark) | Faster, more defensive |
| 4 | Pagoda (sunset, warm) | Fastest, highest block rate |

After clearing stage 2, the **bull bonus round** triggers before stage 3.

## Bull bonus round

- Bull charges from the right at 340 px/s.
- Player has one chance to land a clean hit as the bull closes in.
- **Hit**: bull staggers back with dazed stars. Awards 0.5 bonus yin-yang.
- **Miss**: bull tramples past or escapes. No bonus.
- The bonus point carries into the next bout as a head start.

The bull is canvas-drawn: galloping legs, horns, angry red eye, snorting
steam puffs, swishing tail.

## AI

### Local heuristic AI

`aiControl()` is a reaction-timer state machine:

- **Reaction time** decreases per stage (0.52s down to 0.16s).
- **Block chance** increases per stage (0.18 up to 0.60).
- **Aggression** increases per stage (0.30 up to 0.95).
- Decisions: block (away + down), attack (varied by spacing), approach,
  retreat, jump, idle jitter.

### Jev AI (TypeSafe System One)

When a TypeSafe API key is set (press **J** in-game), the machine player is
driven by [Jev](https://www.typesafe.ai):

- **Endpoint**: `POST https://api.typesafe.ai/v1/systemone`
- **Model**: `jev-latest`
- **Poll interval**: ~450ms
- **Question type**: `Choice` with 14 options (approach, retreat, block,
  jump, punch_high, punch_low, elbow, kick_high, kick_low, sweep, roundhouse,
  back_kick, jump_kick, jump_round, wait)
- **State sent**: compact text — distance, both stances, scores, stage,
  whether opponent is attacking, whether AI is busy.

Fallback is always visible: no key, network error, or confidence below 0.3
falls back to the local heuristic. The HUD shows the current mode
(green = active, yellow = waiting, red = fallback).

## Architecture

```
index.html   — page shell, loads style.css and game.js
style.css    — full-screen canvas, responsive scaling
game.js      — entire game (single file, no dependencies)
```

### Game loop

```
requestAnimationFrame -> loop()
  -> update(dt)    — state machine dispatch
  -> draw()         — background, fighters, HUD, overlays
  -> clear edge-triggered input
```

### State machine

```
title -> fighting -> roundPause -> nextOrEnd()
                                   ├─ fighting (continue bout)
                                   ├─ stageClear -> fighting (next stage)
                                   ├─ bonusIntro -> bonusFight -> bonusResult -> fighting
                                   ├─ champion
                                   └─ gameover
```

### Constants

| Constant | Value | Purpose |
| --- | --- | --- |
| `GROUND_Y` | 470 | Floor level (feet) |
| `ARENA_L` / `ARENA_R` | 60 / 900 | Arena horizontal bounds |
| `HIP_ABOVE_FEET` | 50 | Standing hip height |
| `GRAVITY` | 1700 px/s² | Jump fall |
| `JUMP_VEL` | 660 px/s | Jump launch |
| `WALK` | 168 px/s | Walk speed |
| `POINTS_TO_WIN` | 2.0 | Two full yin-yangs |
| `minGap` | 44 px | Hard wall (can't walk through) |

## Sound

WebAudio-synthesized SFX, no audio files:

| Event | Sound |
| --- | --- |
| Hit | Sawtooth 160Hz + square 90Hz |
| Block | Square 420Hz, short |
| Point scored | Triangle 660 + 990Hz |
| Win | Ascending triangle arpeggio |
| Lose | Descending sawtooth |

`M` toggles mute.
