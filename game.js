"use strict";
/* ============================================================
   The Way of the Exploding Fight — inspired clone
   Vanilla JS, canvas-drawn, no external assets.
   One-on-one karate. Yin-yang scoring (ippon / waza-ari).
   Player vs machine (simple AI, harder per stage).
   ============================================================ */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;

// ---- Arena constants ----
const GROUND_Y = 470;
const ARENA_L = 60, ARENA_R = 900;
const HIP_ABOVE_FEET = 50;       // standing hip height above feet
const GRAVITY = 1700;
const JUMP_VEL = 660;
const WALK = 168;
const BODY_HALF = 16;             // half-width used for contact
const POINTS_TO_WIN = 2.0;        // two full yin-yangs win the bout

// ---- Move definitions ----
// dur: [startup, active, recovery] in seconds
// reach: front-edge distance from center for a hit
// hb: vertical screen-y hitbox range (standing attacker coords)
const G = GROUND_Y;
const MOVES = {
  punchHigh:  { dur:[0.06,0.04,0.16], reach:50, hb:[G-116,G-92],  pose:"PUNCH_HIGH" },
  punchLow:   { dur:[0.06,0.04,0.16], reach:48, hb:[G-76, G-52],  pose:"PUNCH_LOW"  },
  elbow:      { dur:[0.04,0.05,0.18], reach:38, hb:[G-96, G-72],  pose:"PUNCH_HIGH", alwaysIppon:true },
  kickHigh:   { dur:[0.10,0.05,0.24], reach:68, hb:[G-104,G-80],  pose:"KICK_HIGH"  },
  kickLow:    { dur:[0.10,0.05,0.24], reach:62, hb:[G-48, G-24],  pose:"KICK_LOW"   },
  sweep:      { dur:[0.18,0.06,0.36], reach:64, hb:[G-36, G-12],  pose:"SWEEP",     alwaysIppon:true },
  roundhouse: { dur:[0.16,0.06,0.32], reach:76, hb:[G-88, G-56],  pose:"ROUNDHOUSE" },
  backKick:   { dur:[0.12,0.06,0.26], reach:70, hb:[G-82, G-52],  pose:"BACK_KICK"  },
  jumpKick:   { dur:[0.08,0.06,0.20], reach:64, hb:[G-88, G-64],  pose:"JUMP_KICK"  },
  jumpRound:  { dur:[0.10,0.07,0.22], reach:72, hb:[G-92, G-58],  pose:"JUMP_KICK"  },
  jumpPunch:  { dur:[0.05,0.04,0.14], reach:46, hb:[G-114,G-90],  pose:"PUNCH_HIGH" },
};

// ---- Poses (local coords, facing-right; y down positive) ----
// foot support local y must equal 50 - hipYoff to stay on ground.
const POSES = {
  IDLE:        { hipYoff:0,  lean:0.04, hR:{x:16,y:-22}, hL:{x:-6,y:-28}, fR:{x:16,y:50}, fL:{x:-14,y:50} },
  CROUCH:      { hipYoff:22, lean:0.20, hR:{x:10,y:-10}, hL:{x:-4,y:-14}, fR:{x:20,y:28}, fL:{x:-20,y:28} },
  BLOCK:       { hipYoff:0,  lean:-0.08,hR:{x:12,y:-34}, hL:{x:16,y:-24},fR:{x:16,y:50}, fL:{x:-14,y:50} },
  PUNCH_HIGH:  { hipYoff:0,  lean:0.10, hR:{x:44,y:-30}, hL:{x:-14,y:-22},fR:{x:16,y:50}, fL:{x:-16,y:50} },
  PUNCH_LOW:   { hipYoff:0,  lean:0.18, hR:{x:40,y:-4},  hL:{x:-12,y:-20},fR:{x:18,y:50}, fL:{x:-18,y:50} },
  KICK_HIGH:   { hipYoff:0,  lean:-0.14,hR:{x:-10,y:-22},hL:{x:-14,y:-28},fR:{x:52,y:-18},fL:{x:-10,y:50} },
  KICK_LOW:    { hipYoff:14, lean:0.12, hR:{x:-8,y:-18}, hL:{x:-12,y:-24},fR:{x:42,y:36}, fL:{x:-14,y:36} },
  ROUNDHOUSE:  { hipYoff:0,  lean:-0.20,hR:{x:-12,y:-20},hL:{x:-16,y:-28},fR:{x:54,y:8},  fL:{x:-12,y:50} },
  BACK_KICK:   { hipYoff:8,  lean:0.22, hR:{x:-8,y:-14}, hL:{x:-14,y:-20},fR:{x:-52,y:18},fL:{x:12,y:42} },
  SWEEP:       { hipYoff:30, lean:0.30, hR:{x:6,y:-4},   hL:{x:-8,y:-8},  fR:{x:52,y:38}, fL:{x:-16,y:20} },
  JUMP_KICK:   { hipYoff:0,  lean:-0.10,hR:{x:-12,y:-16},hL:{x:-16,y:-24},fR:{x:50,y:6},  fL:{x:-12,y:30} },
  JUMP_IDLE:   { hipYoff:0,  lean:0.02, hR:{x:12,y:-14}, hL:{x:-8,y:-18}, fR:{x:8,y:26},  fL:{x:-8,y:30} },
  HIT:         { hipYoff:0,  lean:-0.26,hR:{x:-14,y:-22},hL:{x:-18,y:-16},fR:{x:16,y:50}, fL:{x:-16,y:50} },
  KO:          { hipYoff:38, lean:0.9,  hR:{x:30,y:-2},  hL:{x:-30,y:-2}, fR:{x:24,y:12}, fL:{x:-24,y:12} },
};

// limb lengths
const L_TORSO=34, L_HEAD=9, L_UARM=24, L_FARM=22, L_THIGH=28, L_SHIN=28;

// ============================================================
// Math helpers
// ============================================================
const clamp = (v,a,b)=> v<a?a:(v>b?b:v);
const lerp = (a,b,t)=> a+(b-a)*t;
const lerpPt = (a,b,t)=>({x:lerp(a.x,b.x,t), y:lerp(a.y,b.y,t)});
function solveIK(sx,sy,ex,ey,a,b,bend){
  let dx=ex-sx, dy=ey-sy; let d=Math.hypot(dx,dy);
  d = clamp(d, Math.abs(a-b)+0.5, a+b-0.5);
  const base = Math.atan2(dy,dx);
  const cosA = clamp((a*a + d*d - b*b)/(2*a*d), -1, 1);
  const A = Math.acos(cosA);
  const ang = base + bend*A;
  return { kx: sx + a*Math.cos(ang), ky: sy + a*Math.sin(ang) };
}

// ============================================================
// Sound (tiny WebAudio synth, no assets)
// ============================================================
const Sound = (()=>{
  let ac=null, muted=false;
  function ensure(){ if(!ac){ try{ ac = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } }
  function blip(freq,dur,type,vol){
    if(muted) return; ensure(); if(!ac) return;
    const t=ac.currentTime, o=ac.createOscillator(), g=ac.createGain();
    o.type=type||"square"; o.frequency.setValueAtTime(freq,t);
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol||0.2,t+0.005);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t+dur);
  }
  return {
    hit(){ blip(160,0.18,"sawtooth",0.3); blip(90,0.22,"square",0.2); },
    block(){ blip(420,0.08,"square",0.15); },
    step(){ blip(120,0.04,"sine",0.05); },
    point(){ blip(660,0.1,"triangle",0.2); blip(990,0.14,"triangle",0.15); },
    win(){ [523,659,784,1047].forEach((f,i)=>setTimeout(()=>blip(f,0.18,"triangle",0.2),i*110)); },
    lose(){ [330,262,196].forEach((f,i)=>setTimeout(()=>blip(f,0.3,"sawtooth",0.2),i*150)); },
    toggle(){ muted=!muted; return muted; },
  };
})();

// ============================================================
// Jev AI (TypeSafe System One model)
// Polls POST https://api.typesafe.ai/v1/systemone with a compact
// game state and a Choice question. Falls back to local AI when
// no key, network error, or low confidence.
// ============================================================
const JevAI = (()=>{
  // Use the local proxy (/jev) when served by server.js, which forwards
  // to the TypeSafe API server-side to avoid browser CORS restrictions.
  // Falls back to the direct URL if not on a local server.
  const ENDPOINT = location.protocol.startsWith("http")
    ? "/jev"
    : "https://api.typesafe.ai/v1/systemone";
  const MODEL = "jev-latest";
  const POLL_MS = 300;          // how often to query Jev
  const CONFIDENCE_FLOOR = 0.3; // below this, fall back

  let apiKey = localStorage.getItem("typesafe_api_key") || "";
  let enabled = !!apiKey;

  // Ring-buffer log of every Jev poll. Shared across all instances.
  const LOG_MAX = 200;
  const log = [];
  function addLog(entry){
    log.push(entry);
    if(log.length > LOG_MAX) log.shift();
  }

  // action options sent to Jev — each maps to a button combo
  const ACTIONS = {
    approach:    "Move toward the opponent to close distance",
    retreat:     "Step away from the opponent to create space",
    block:       "Hold back and down to block incoming attacks",
    jump:        "Jump into the air",
    punch_high:  "Throw a high punch to the head",
    punch_low:   "Throw a low punch to the body",
    elbow:       "Step in and strike with the elbow, very short range but always scores a full point",
    kick_high:   "Throw a high kick to the head",
    kick_low:    "Throw a low kick to the legs",
    sweep:       "Drop low and sweep the opponent's legs, slow but always scores a full point",
    roundhouse:  "Throw a powerful roundhouse kick, step toward and kick",
    back_kick:   "Kick backward while stepping away, good for spacing",
    jump_kick:   "Jump and kick in the air",
    jump_round:  "Jump toward the opponent and roundhouse kick in the air",
    wait:        "Hold position and observe",
  };

  // ---- Factory: each instance has independent polling state ----
  // styles is an array of style strings; the fighter randomly switches
  // between them every few seconds for variety.
  function create(id, styles){
    let pollTimer = 0;
    let inflight = false;
    let lastChoice = null;
    let useFallback = false;
    let status = "idle";
    let statusDetail = "";
    let styleIdx = 0;
    let styleTimer = 0;
    let styleSwapIn = 2 + Math.random() * 3;  // 2-5 seconds before first switch
    function activeStyle(){ return (styles && styles[styleIdx]) || ""; }

    // map Jev choice -> button-combo. Uses abstract toward/away flags
    // instead of pre-computing left/right, so updateFighter can resolve
    // the direction from the current facing (which may change between
    // the tick call and the fighter update).
    function choiceToAction(choice, ai, opp){
      const o = { left:false,right:false,up:false,down:false,punch:false,kick:false,toward:false,away:false };
      const airborne = ai.y < GROUND_Y - 1;
      switch(choice){
        case "approach":   o.toward=true; break;
        case "retreat":    o.away=true; break;
        case "block":      o.away=true; o.down=true; break;
        case "jump":       o.up=true; break;
        case "punch_high": o.punch=true; break;
        case "punch_low":  o.down=true; o.punch=true; break;
        case "elbow":      o.toward=true; o.punch=true; break;
        case "kick_high":  o.kick=true; break;
        case "kick_low":   o.down=true; o.kick=true; break;
        case "sweep":      o.away=true; o.down=true; o.kick=true; break;
        case "roundhouse": o.toward=true; o.kick=true; break;
        case "back_kick":  o.away=true; o.kick=true; break;
        case "jump_kick":  airborne ? o.kick=true : o.up=true; break;
        case "jump_round": airborne ? (o.kick=true, o.toward=true) : o.up=true; break;
        case "wait":       break;
        default:           break;
      }
      return o;
    }

    function buildState(ai, opp, stage){
      const d = Math.round(Math.abs(opp.x - ai.x));
      const aiStance = ai.state + (ai.crouching ? "(crouching)" : "") + (ai.y<GROUND_Y-1 ? "(airborne)" : "");
      const oppStance = opp.state + (opp.crouching ? "(crouching)" : "") + (opp.y<GROUND_Y-1 ? "(airborne)" : "");
      const aiPos = ai.x < 150 ? "I am near my left wall" : ai.x > 810 ? "I am near my right wall" : "I am in the center of the arena";
      const oppPos = opp.x < 150 ? "opponent is near the left wall" : opp.x > 810 ? "opponent is near the right wall" : "opponent is in the center";
      const range = d < 50 ? "close range — use elbows, low punches, or sweeps" : d < 70 ? "punch range — use punches or step in for elbow" : d < 90 ? "kick range — use high kicks, roundhouses, or low kicks" : "far range — approach quickly, do not jump";
      const recent = lastChoice ? "My last move was " + lastChoice + "." : "I have not acted yet.";
      return [
        "Karate bout. Yin-yang scoring: clean hit = ippon (1pt), glancing = waza-ari (0.5pt). First to 2 points wins.",
        "Stage " + stage + " of 4. Higher stages have faster opponents.",
        "My score: " + ai.score.toFixed(1) + ". Opponent score: " + opp.score.toFixed(1) + ".",
        "Distance between fighters: " + d + " pixels. We are at " + range + ".",
        "My stance: " + aiStance + ". Opponent stance: " + oppStance + ".",
        aiPos + ". The " + oppPos + ".",
        "Opponent is " + (opp.state==="attack" ? "attacking — block or counter now" : "not attacking — this is my chance to strike") + ".",
        "I am " + (ai.busy ? "busy" : "free to act") + ".",
        recent,
        activeStyle() || "",
      ].join(" ");
    }

    async function query(ai, opp, stage){
      const stateStr = buildState(ai, opp, stage);
      const body = {
        model: MODEL,
        state: stateStr,
        questions: {
          action: {
            type: "choice",
            instructions: "Which move should the fighter make right now?",
            criteria: ACTIONS,
          }
        }
      };
      const ctrl = new AbortController();
      const timeout = setTimeout(()=>ctrl.abort(), 3000);
      let resp;
      try {
        resp = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
      } catch(e){
        throw new Error(e.name==="AbortError" ? "timeout" : "network");
      } finally {
        clearTimeout(timeout);
      }
      if(!resp.ok) throw new Error("HTTP " + resp.status);
      const data = await resp.json();
      const ans = data.answers && data.answers.action;
      if(!ans || !ans.choice) throw new Error("no choice in response");
      return { choice: ans.choice, confidence: ans.confidence || 0, state: stateStr, probabilities: ans.probabilities || null };
    }

    function tick(ai, opp, stage, dt, fallbackFn){
      if(!enabled || !apiKey){
        return fallbackFn();
      }
      // style switching: randomly change fighting style every few seconds
      if(styles && styles.length > 1){
        styleTimer += dt;
        if(styleTimer >= styleSwapIn){
          styleTimer = 0;
          styleIdx = (styleIdx + 1) % styles.length;
          styleSwapIn = 3 + Math.random() * 4;  // 3-7 seconds
          lastChoice = null;  // force fresh decision with new style
        }
      }
      pollTimer += dt;
      if(inflight) {
        return useFallback ? fallbackFn()
          : (lastChoice ? choiceToAction(lastChoice, ai, opp) : fallbackFn());
      }
      if(pollTimer < POLL_MS/1000 && (lastChoice || useFallback)){
        return useFallback ? fallbackFn() : choiceToAction(lastChoice, ai, opp);
      }
      pollTimer = 0;
      inflight = true;
      // keep showing "active" during fetch — no yellow flicker
      query(ai, opp, stage).then(res=>{
        inflight = false;
        if(res.confidence < CONFIDENCE_FLOOR){
          status = "fallback";
          statusDetail = "low conf " + res.confidence.toFixed(2);
          lastChoice = null;
          useFallback = true;
          addLog({ t: Date.now(), id, stage, ok: false, reason: "low_conf", choice: res.choice, confidence: res.confidence, state: res.state, probabilities: res.probabilities });
        } else {
          // Sample from Jev's probability distribution with a temperature
          // for natural variety. Temperature >1 flattens the distribution,
          // making lower-probability moves more likely. We never repeat the
          // last move -- if sampled, we resample from the rest.
          let picked = res.choice;
          if(res.probabilities){
            const temp = 1.6 + Math.random() * 0.8;  // 1.6-2.4
            const entries = Object.entries(res.probabilities)
              .filter(([k]) => k !== lastChoice);
            if(entries.length > 0){
              const weights = entries.map(([,v]) => Math.pow(v, 1 / temp));
              const sum = weights.reduce((a,b)=>a+b, 0);
              let r = Math.random() * sum;
              for(let i = 0; i < entries.length; i++){
                r -= weights[i];
                if(r <= 0){ picked = entries[i][0]; break; }
              }
            }
          }
          status = "active";
          statusDetail = picked + " (" + res.confidence.toFixed(2) + ")";
          lastChoice = picked;
          useFallback = false;
          addLog({ t: Date.now(), id, stage, ok: true, choice: picked, jevChoice: res.choice, confidence: res.confidence, state: res.state, probabilities: res.probabilities });
        }
      }).catch(err=>{
        inflight = false;
        status = "fallback";
        statusDetail = String(err.message || err).slice(0,30);
        lastChoice = null;
        useFallback = true;
        addLog({ t: Date.now(), id, stage, ok: false, reason: String(err.message || err), choice: null, confidence: null, state: null, probabilities: null });
      });
      return useFallback ? fallbackFn()
        : (lastChoice ? choiceToAction(lastChoice, ai, opp) : fallbackFn());
    }

    return {
      tick,
      getStatus(){ return { status, detail: statusDetail }; },
      reset(){ pollTimer=0; inflight=false; lastChoice=null; useFallback=false; status="idle"; statusDetail=""; styleIdx=0; styleTimer=0; styleSwapIn=2+Math.random()*3; },
    };
  }

  // p2 instance (AI opponent) and p1 instance (autoplay)
  // Each fighter has two styles and randomly switches between them.
  const p2inst = create("p2", [
    "My fighting style: defensive wall. I block frequently and wait for the opponent to commit, then punish with a sweep or elbow at close range. I use back kicks to create space. I retreat in short steps to bait attacks, then step in and counter. I never jump. My favorite moves are block, sweep, and elbow. I mix high and low attacks. If near a wall I step forward to escape.",
    "My fighting style: pressure kickboxer. I move forward steadily and throw roundhouse kicks at mid range — my signature move. At close range I use low punches and elbows. I rarely block, preferring to attack first. I use jump kicks occasionally to close distance fast but mostly stay grounded. My favorite moves are roundhouse, kick_high, and elbow. If the opponent is near a wall I press with roundhouses.",
  ]);
  const p1inst = create("p1", [
    "My fighting style: relentless swarmer. I charge in and stay at close range, throwing elbows, low punches, and sweeps in rapid succession. I barely retreat — if the opponent backs off I pursue immediately with quick steps. I block only when I see the opponent attacking. My favorite moves are elbow, punch_low, and sweep. I never jump — I fight on the ground. If near a wall I press forward.",
    "My fighting style: ranged striker. I keep the opponent at kick range and use high kicks, low kicks, and back kicks. I step in to throw a roundhouse, then step back out. I jump kick when the opponent tries to close distance. I block when pressured. My favorite moves are kick_high, back_kick, and roundhouse. I retreat to maintain spacing but never into a corner — I circle with back kicks instead.",
  ]);

  return {
    ...p2inst,           // primary instance (p2) — backward compatible
    p1: p1inst,          // second instance for autoplay mode
    isEnabled(){ return enabled; },
    getLog(){ return log.slice(); },
    clearLog(){ log.length = 0; },
    setKey(key){
      apiKey = key || "";
      enabled = !!apiKey;
      localStorage.setItem("typesafe_api_key", apiKey);
      p2inst.reset(); p1inst.reset();
    },
    getKey(){ return apiKey; },
    reset(){ p2inst.reset(); p1inst.reset(); },
  };
})();
// Expose for DevTools console: window.jevLog, window.jevClear
window.jevLog = ()=>JevAI.getLog();
window.jevClear = ()=>JevAI.clearLog();


const Keys = {};
const Pressed = {}; // edge-triggered this frame
const KEYMAP = {
  left:  ["ArrowLeft","KeyA"],
  right: ["ArrowRight","KeyD"],
  up:    ["ArrowUp","KeyW"],
  down:  ["ArrowDown","KeyS"],
  punch: ["KeyF","KeyV"],
  kick:  ["KeyG","KeyK"],
  start: ["Enter","Space"],
};
function k(action){ return KEYMAP[action].some(c=>Keys[c]); }
function kPress(action){ return KEYMAP[action].some(c=>Pressed[c]); }
addEventListener("keydown", e=>{
  if(!Keys[e.code]) Pressed[e.code]=true;
  Keys[e.code]=true;
  if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Space"].includes(e.code)) e.preventDefault();
  if(e.code==="KeyM") Sound.toggle();
  if(e.code==="KeyL") showJevLog = !showJevLog;
  if(e.code==="Digit0"){ autoplay = !autoplay; JevAI.p1.reset(); }
  if(e.code==="KeyJ"){
    const key = prompt("Enter TypeSafe API key (leave empty to disable Jev and use local AI):", JevAI.getKey()||"");
    if(key !== null){ JevAI.setKey(key.trim()); }
  }
});
addEventListener("keyup", e=>{ Keys[e.code]=false; });

// ============================================================
// Fighter
// ============================================================
function makeFighter(x, facing, isAI){
  return {
    x, y:GROUND_Y, vy:0, facing,
    isAI,
    state:"idle",        // idle | walk | crouch | jump | attack | block | hit
    move:null,           // {key,t,phase}
    busy:false,
    crouching:false,
    walkPhase:0,
    score:0,
    pose: clonePose(POSES.IDLE),
    flash:0,             // hit flash timer
    stun:0,              // block/hit stun
    name:"",
  };
}
function clonePose(p){ return { hipYoff:p.hipYoff, lean:p.lean, hR:{...p.hR}, hL:{...p.hL}, fR:{...p.fR}, fL:{...p.fL} }; }

function startMove(f, key){
  if(f.busy || f.stun>0) return;
  if(f.y < GROUND_Y - 1 && !(key==="jumpKick"||key==="jumpPunch")) return; // grounded-only moves need ground
  if(key==="jumpKick"||key==="jumpPunch"){ if(f.y>=GROUND_Y-1) return; }    // air moves need air
  f.move = { key, t:0, phase:"startup" };
  f.state="attack"; f.busy=true;
}

function tryJump(f){
  if(f.busy||f.stun>0) return;
  if(f.y>=GROUND_Y-1 && f.vy>=0){ f.vy=-JUMP_VEL; f.state="jump"; f.y=GROUND_Y-2; }
}

function updateFighter(f, opp, dt, aiCtl){
  // facing toward opponent unless busy attacking
  if(!f.busy) f.facing = opp.x >= f.x ? 1 : -1;

  // timers
  if(f.flash>0) f.flash -= dt;
  if(f.stun>0){ f.stun -= dt; if(f.stun<=0 && f.state==="hit") f.state="idle"; }

  // ---- movement (player) ----
  let ml=0, mr=0, up=false, down=false, punch=false, kick=false;
  if(aiCtl){ ml=aiCtl.left; mr=aiCtl.right; up=aiCtl.up; down=aiCtl.down; punch=aiCtl.punch; kick=aiCtl.kick; if(aiCtl.toward){ if(f.facing>0) mr=true; else ml=true; } if(aiCtl.away){ if(f.facing>0) ml=true; else mr=true; } }
  else if(!f.busy && f.stun<=0){
    ml=k("left"); mr=k("right"); up=k("up"); down=k("down"); punch=k("punch"); kick=k("kick");
  }

  // attack input edges
  if(!f.busy && f.stun<=0){
    const away = (f.facing>0 && ml && !mr) || (f.facing<0 && mr && !ml);
    const towardDir = (f.facing>0 ? mr : ml);
    if(punch){
      if(f.y<GROUND_Y-1) startMove(f,"jumpPunch");
      else if(towardDir) startMove(f,"elbow");
      else if(down) startMove(f,"punchLow");
      else startMove(f,"punchHigh");
    } else if(kick){
      if(f.y<GROUND_Y-1){
        if(towardDir) startMove(f,"jumpRound");
        else startMove(f,"jumpKick");
      } else if(down && away) startMove(f,"sweep");
      else if(down) startMove(f,"kickLow");
      else if(away) startMove(f,"backKick");
      else if(towardDir) startMove(f,"roundhouse");
      else startMove(f,"kickHigh");
    }
    if(up) tryJump(f);
  }

  f.crouching = (!f.busy && f.stun<=0 && down && f.y>=GROUND_Y-1);

  // horizontal movement
  if(!f.busy && f.stun<=0 && f.y>=GROUND_Y-1){
    let dir = (mr?1:0)-(ml?1:0);
    // block: hold back (away from opponent) and down, with no attack intent
    const holdingAway = (f.facing>0 && ml && !mr) || (f.facing<0 && mr && !ml);
    if(holdingAway && down && !punch && !kick && !up){
      f.state="block";
      dir = 0;
    } else if(dir!==0 && !down){
      const oldX = f.x;
      f.x += dir*WALK*dt;
      // hard wall: can't walk past the opponent
      const minGap = 44;
      if(f.facing > 0 && f.x > opp.x - minGap) f.x = opp.x - minGap;
      if(f.facing < 0 && f.x < opp.x + minGap) f.x = opp.x + minGap;
      if(f.x !== oldX){ f.state="walk"; f.walkPhase += dt*9*dir; }
      else f.state="idle";
    } else if(!f.crouching){
      f.state="idle";
    }
    if(f.crouching) f.state="crouch";
  }

  // jump physics + air drift
  if(f.y < GROUND_Y-1){
    f.vy += GRAVITY*dt;
    f.y += f.vy*dt;
    if(!f.busy){
      let dir=(mr?1:0)-(ml?1:0);
      f.x += dir*WALK*0.6*dt;
      if(f.state!=="attack") f.state="jump";
    }
    if(f.y >= GROUND_Y){ f.y=GROUND_Y; f.vy=0; if(!f.busy) f.state="idle"; }
  }

  // arena bounds
  f.x = clamp(f.x, ARENA_L, ARENA_R);

  // ---- advance current move ----
  if(f.move){
    const m=MOVES[f.move.key]; const d=m.dur;
    f.move.t += dt;
    let acc=0;
    const phases=[["startup",d[0]],["active",d[1]],["recovery",d[2]]];
    let placed=false;
    for(const [name,len] of phases){
      if(f.move.t < acc+len){ f.move.phase=name; placed=true; break; }
      acc+=len;
    }
    if(!placed){
      // move finished
      f.move=null; f.busy=false;
      if(f.y<GROUND_Y-1) f.state="jump"; else f.state="idle";
    }
  }
}

// resolve a hit from attacker onto defender; returns award or null
function resolveHit(atk, def){
  if(!atk.move || MOVES[atk.move.key]===undefined) return null;
  if(atk.move.phase!=="active") return null;
  // only trigger once per attack
  if(atk.move.spent) return null;
  const m=MOVES[atk.move.key];
  const airOff = GROUND_Y - atk.y; // how high feet are raised (>0 in air)
  const y0=m.hb[0]-airOff, y1=m.hb[1]-airOff;
  // defender body box
  let dH = (def.crouching && def.y>=GROUND_Y-1) ? 60 : 110;
  const by0=def.y-dH, by1=def.y-6;   // top of head to just below waist
  // horizontal
  const fdist = atk.facing*(def.x-atk.x);
  if(fdist < 30 || fdist > m.reach+8) return null;   // tighter range window
  // vertical overlap
  if(!(y0 < by1 && y1 > by0)) return null;
  atk.move.spent = true;
  // blocked?
  const blocking = (def.state==="block");
  if(blocking){
    return { type:"block" };
  }
  // connection -> ippon or waza-ari
  let pts;
  if(def.state==="attack") pts=0.5;        // trade
  else if(m.alwaysIppon) pts=1.0;          // certain moves always ippon
  else if(fdist <= m.reach*0.55) pts=1.0;  // clean / well-timed
  else pts=0.5;                           // glancing
  return { type:"hit", pts };
}

// ============================================================
// Drawing
// ============================================================
function bgTheme(stage){
  const themes=[
    { sky:["#caa46a","#8a6a3a"], ground:"#5a3a22", accent:"#2a1a10", name:"DOJO" },
    { sky:["#9fc6e8","#dfeefc"], ground:"#eef4fb", accent:"#cdd9e6", name:"SNOW" },
    { sky:["#3a2a4a","#7a5a6a"], ground:"#2a2230", accent:"#1a1620", name:"BUDDHA" },
    { sky:["#ff9a3c","#ffd17a"], ground:"#7a3a1a", accent:"#3a1a0a", name:"PAGODA" },
  ];
  return themes[(stage-1)%themes.length];
}
// Seated sensei: green gi, tricornered Chinese peasant hat
function drawSensei(sx, sy){
  const scale = 0.6;
  const s = (v)=> v * scale;
  const gi = "#3a6a3a";
  const giDark = "#2a4a2a";
  const giDarker = "#1a3a1a";
  const skin = "#e8b88a";
  const skinShade = "#c89868";
  const hatCol = "#6a4a2a";
  const hatDark = "#4a3a1a";
  const beltCol = "#886622";

  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath(); ctx.ellipse(sx, sy+4, s(24), s(5), 0, 0, Math.PI*2); ctx.fill();

  // cross-legged seated body (wider at base)
  // legs crossed � two trapezoid shapes
  ctx.fillStyle = giDark;
  ctx.beginPath();
  ctx.moveTo(sx-s(22), sy);
  ctx.lineTo(sx+s(22), sy);
  ctx.lineTo(sx+s(16), sy-s(10));
  ctx.lineTo(sx-s(16), sy-s(10));
  ctx.closePath(); ctx.fill();

  // feet peeking out
  ctx.fillStyle = skinShade;
  ctx.beginPath(); ctx.ellipse(sx-s(20), sy-s(2), s(6), s(3), 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(sx+s(20), sy-s(2), s(6), s(3), 0, 0, Math.PI*2); ctx.fill();

  // torso (green gi jacket � trapezoid, narrow at shoulders, wide at hips)
  const torsoTop = sy - s(34);
  const torsoBot = sy - s(12);
  ctx.fillStyle = gi;
  ctx.beginPath();
  ctx.moveTo(sx-s(10), torsoTop);
  ctx.lineTo(sx+s(10), torsoTop);
  ctx.lineTo(sx+s(16), torsoBot);
  ctx.lineTo(sx-s(16), torsoBot);
  ctx.closePath(); ctx.fill();

  // gi lapel (V-neck)
  ctx.fillStyle = giDark;
  ctx.beginPath();
  ctx.moveTo(sx-s(10), torsoTop);
  ctx.lineTo(sx-s(2), torsoTop+s(6));
  ctx.lineTo(sx, torsoTop+s(10));
  ctx.lineTo(sx+s(2), torsoTop+s(6));
  ctx.lineTo(sx+s(10), torsoTop);
  ctx.closePath(); ctx.fill();

  // belt
  ctx.strokeStyle = beltCol; ctx.lineWidth = s(4); ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(sx-s(15), torsoBot-s(2));
  ctx.lineTo(sx+s(15), torsoBot-s(2));
  ctx.stroke();
  // belt knot
  ctx.fillStyle = beltCol;
  ctx.beginPath(); ctx.arc(sx+s(1), torsoBot-s(2), s(3), 0, Math.PI*2); ctx.fill();
  // belt tails
  ctx.strokeStyle = beltCol; ctx.lineWidth = s(2.5); ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(sx+s(1), torsoBot-s(1));
  ctx.lineTo(sx+s(3), torsoBot+s(4));
  ctx.moveTo(sx+s(1), torsoBot-s(1));
  ctx.lineTo(sx-s(2), torsoBot+s(4));
  ctx.stroke();

  // arms resting on knees (sleeves)
  ctx.fillStyle = gi;
  // left arm
  ctx.beginPath();
  ctx.moveTo(sx-s(10), torsoTop+s(2));
  ctx.lineTo(sx-s(22), sy-s(6));
  ctx.lineTo(sx-s(18), sy-s(4));
  ctx.lineTo(sx-s(8), torsoTop+s(4));
  ctx.closePath(); ctx.fill();
  // right arm
  ctx.beginPath();
  ctx.moveTo(sx+s(10), torsoTop+s(2));
  ctx.lineTo(sx+s(22), sy-s(6));
  ctx.lineTo(sx+s(18), sy-s(4));
  ctx.lineTo(sx+s(8), torsoTop+s(4));
  ctx.closePath(); ctx.fill();
  // hands on knees
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(sx-s(21), sy-s(6), s(3.5), 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(sx+s(21), sy-s(6), s(3.5), 0, Math.PI*2); ctx.fill();

  // neck
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(sx, torsoTop-s(2), s(3), 0, Math.PI*2); ctx.fill();

  // head
  const headY = torsoTop - s(8);
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(sx, headY, s(7), 0, Math.PI*2); ctx.fill();

  // hair (short, dark)
  ctx.fillStyle = "#2a1a0a";
  ctx.beginPath(); ctx.arc(sx, headY-s(1), s(7.5), Math.PI*1.1, Math.PI*1.9); ctx.fill();

  // eyes � calm, closed (meditating sensei)
  ctx.strokeStyle = "#222"; ctx.lineWidth = s(1.2); ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(sx-s(3), headY-s(1)); ctx.lineTo(sx-s(1), headY-s(1));
  ctx.moveTo(sx+s(1), headY-s(1)); ctx.lineTo(sx+s(3), headY-s(1));
  ctx.stroke();

  // tricornered Chinese peasant hat (rice hat / douli)
  // wide conical hat with a flat-ish top and three visible corners
  ctx.fillStyle = hatCol;
  ctx.beginPath();
  ctx.moveTo(sx-s(16), headY-s(4));
  ctx.quadraticCurveTo(sx, headY-s(14), sx+s(16), headY-s(4));
  ctx.lineTo(sx+s(12), headY-s(2));
  ctx.quadraticCurveTo(sx, headY-s(8), sx-s(12), headY-s(2));
  ctx.closePath(); ctx.fill();
  // hat brim shadow
  ctx.fillStyle = hatDark;
  ctx.beginPath();
  ctx.moveTo(sx-s(16), headY-s(4));
  ctx.quadraticCurveTo(sx, headY-s(12), sx+s(16), headY-s(4));
  ctx.lineTo(sx+s(14), headY-s(3));
  ctx.quadraticCurveTo(sx, headY-s(10), sx-s(14), headY-s(3));
  ctx.closePath(); ctx.fill();
  // hat top knob
  ctx.fillStyle = hatDark;
  ctx.beginPath(); ctx.arc(sx, headY-s(11), s(1.5), 0, Math.PI*2); ctx.fill();
}

function drawBackground(stage){
  const t=bgTheme(stage);
  const g=ctx.createLinearGradient(0,0,0,GROUND_Y);
  g.addColorStop(0,t.sky[0]); g.addColorStop(1,t.sky[1]);
  ctx.fillStyle=g; ctx.fillRect(0,0,W,GROUND_Y);
  // distant elements per theme
  ctx.save();
  if(t.name==="DOJO"){
    ctx.fillStyle="#6a4a2a"; ctx.fillRect(0,GROUND_Y-180,40,H); ctx.fillRect(W-40,GROUND_Y-180,40,H);
    ctx.fillStyle="#3a2a1a";
    for(let i=0;i<6;i++){ ctx.fillRect(40+i*150,GROUND_Y-180,8,180); }
  } else if(t.name==="SNOW"){
    ctx.fillStyle="#bfe0f0";
    for(let i=0;i<5;i++){ const mx=120+i*190, my=GROUND_Y-150; ctx.beginPath();
      ctx.moveTo(mx-70,my+40); ctx.lineTo(mx,my-40); ctx.lineTo(mx+70,my+40); ctx.closePath(); ctx.fill(); }
  } else if(t.name==="BUDDHA"){
    ctx.fillStyle="rgba(20,16,24,0.85)";
    const bx=W*0.5, by=GROUND_Y;
    ctx.beginPath(); ctx.arc(bx,by-220,70,Math.PI,0); ctx.fill(); // head
    ctx.fillRect(bx-90,by-180,180,180);          // body
    ctx.fillRect(bx-130,by-120,260,30);          // lap
  } else if(t.name==="PAGODA"){
    ctx.fillStyle="rgba(40,16,8,0.8)";
    for(let i=0;i<3;i++){ const px=150+i*340, py=GROUND_Y;
      for(let l=0;l<4;l++){ const w=120-l*22, top=py-40-l*42;
        ctx.fillRect(px-w/2,top,w,34);
        ctx.beginPath(); ctx.moveTo(px-w/2-12,top); ctx.lineTo(px,top-16); ctx.lineTo(px+w/2+12,top); ctx.closePath(); ctx.fill();
      }
    }
  }
  ctx.restore();
  // sensei watching � seated, green gi, tricornered Chinese peasant hat
  drawSensei(60, GROUND_Y-6);
  // ground
  ctx.fillStyle=t.ground; ctx.fillRect(0,GROUND_Y,W,H-GROUND_Y);
  ctx.fillStyle=t.accent; ctx.fillRect(0,GROUND_Y,W,4);
  // floor line texture
  ctx.strokeStyle="rgba(0,0,0,0.12)"; ctx.lineWidth=1;
  for(let i=0;i<10;i++){ ctx.beginPath(); ctx.moveTo(0,GROUND_Y+ i*7); ctx.lineTo(W,GROUND_Y+i*7); ctx.stroke(); }
}

function drawLimb(x0,y0,x1,y1,x2,y2,thick,col){
  ctx.strokeStyle=col; ctx.lineWidth=thick; ctx.lineCap="round"; ctx.lineJoin="round";
  ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
}

function drawFist(x,y,skin,col){
  ctx.fillStyle=col; ctx.beginPath(); ctx.arc(x,y,4.5,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=skin; ctx.beginPath(); ctx.arc(x+1,y+1,2.5,0,Math.PI*2); ctx.fill();
}
function drawFoot(x,y,face,col){
  ctx.fillStyle=col;
  ctx.beginPath(); ctx.ellipse(x+face*3,y,6,3.5,0,0,Math.PI*2); ctx.fill();
}

function drawFighter(f){
  const p=f.pose;
  const hipY = f.y - HIP_ABOVE_FEET + p.hipYoff;
  const face=f.facing;
  const wx=(lx,ly)=>[f.x + lx*face, hipY + ly];

  // ---- ground shadow ----
  const airT = clamp((GROUND_Y - f.y)/180, 0, 1);
  ctx.fillStyle = `rgba(0,0,0,${0.28*(1-airT)})`;
  ctx.beginPath();
  ctx.ellipse(f.x, GROUND_Y+4, 28*(1-airT*0.5), 6*(1-airT*0.5), 0, 0, Math.PI*2);
  ctx.fill();

  // torso direction (lean)
  const a = -Math.PI/2 + p.lean;
  const tdirx=Math.cos(a), tdiry=Math.sin(a);
  const neck = wx(L_TORSO*tdirx, L_TORSO*tdiry);
  const shoulder = wx((L_TORSO-8)*tdirx, (L_TORSO-8)*tdiry);
  const head = wx((L_TORSO+L_HEAD+2)*tdirx, (L_TORSO+L_HEAD+2)*tdiry);
  const hip = wx(0,0);

  // colors
  const gi = f.flash>0 ? "#ffffff" : (f.isAI ? "#d04a4a" : "#3a78d0");
  const giDark = f.isAI ? "#9a3030" : "#2a5aa0";
  const giDarker = f.isAI ? "#6a2020" : "#1a3a70";
  const skin = "#e8b88a";
  const skinShade = "#c89868";
  const beltCol = f.isAI ? "#222" : "#cc0";
  const hairCol = f.isAI ? "#2a1a0a" : "#1a1a2a";

  // ---- BACK limbs (darker) first ----
  const fR=wx(p.fR.x,p.fR.y), fL=wx(p.fL.x,p.fL.y);
  const hR=wx(p.hR.x,p.hR.y), hL=wx(p.hL.x,p.hL.y);

  // back leg
  const legK2 = solveIK(hip[0],hip[1], fL[0],fL[1], L_THIGH,L_SHIN, face>0?-1:1);
  drawLimb(hip[0],hip[1], legK2.kx,legK2.ky, fL[0],fL[1], 11, giDarker);
  // bare shin
  const shLx = lerp(legK2.kx,fL[0],0.45), shLy = lerp(legK2.ky,fL[1],0.45);
  drawLimb(shLx,shLy, fL[0],fL[1], 8, skinShade);
  drawFoot(fL[0],fL[1], face, skinShade);

  // back arm
  const aK2 = solveIK(shoulder[0],shoulder[1], hL[0],hL[1], L_UARM,L_FARM, face>0?1:-1);
  drawLimb(shoulder[0],shoulder[1], aK2.kx,aK2.ky, hL[0],hL[1], 9, giDarker);
  // bare forearm
  const faLx = lerp(aK2.kx,hL[0],0.45), faLy = lerp(aK2.ky,hL[1],0.45);
  drawLimb(faLx,faLy, hL[0],hL[1], 7, skinShade);
  drawFist(hL[0],hL[1], skin, giDarker);

  // ---- GI JACKET (filled trapezoid) ----
  // compute shoulder/hip widths perpendicular to torso dir
  const perpX = -tdiry, perpY = tdirx;
  const sw = 14, hw = 10; // half-width at shoulders/hips
  const sl = [shoulder[0]+perpX*sw, shoulder[1]+perpY*sw];
  const sr = [shoulder[0]-perpX*sw, shoulder[1]-perpY*sw];
  const hl = [hip[0]+perpX*hw, hip[1]+perpY*hw];
  const hr = [hip[0]-perpX*hw, hip[1]-perpY*hw];
  ctx.fillStyle = gi;
  ctx.beginPath();
  ctx.moveTo(sl[0],sl[1]); ctx.lineTo(sr[0],sr[1]);
  ctx.lineTo(hr[0],hr[1]); ctx.lineTo(hl[0],hl[1]); ctx.closePath(); ctx.fill();
  // gi lapel (V-neck)
  ctx.fillStyle = giDark;
  ctx.beginPath();
  ctx.moveTo(sl[0],sl[1]);
  ctx.lineTo(shoulder[0]+perpX*3, shoulder[1]+perpY*3);
  ctx.lineTo(neck[0], neck[1]);
  ctx.lineTo(shoulder[0]-perpX*3, shoulder[1]-perpY*3);
  ctx.lineTo(sr[0],sr[1]);
  ctx.lineTo(sr[0]-tdirx*2, sr[1]-tdiry*2);
  ctx.lineTo(hl[0]+tdirx*2, hl[1]+tdiry*2);
  ctx.lineTo(sl[0]+tdirx*2, sl[1]+tdiry*2);
  ctx.closePath(); ctx.fill();
  // lapel line
  ctx.strokeStyle = giDarker; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(sl[0],sl[1]); ctx.lineTo(neck[0],neck[1]); ctx.lineTo(sr[0],sr[1]); ctx.stroke();

  // ---- BELT ----
  ctx.strokeStyle=beltCol; ctx.lineWidth=5; ctx.lineCap="butt";
  ctx.beginPath();
  ctx.moveTo(hip[0]+perpX*11, hip[1]+perpY*11);
  ctx.lineTo(hip[0]-perpX*11, hip[1]-perpY*11);
  ctx.stroke();
  // belt knot
  ctx.fillStyle=beltCol;
  ctx.beginPath(); ctx.arc(hip[0]+face*2, hip[1], 3.5, 0, Math.PI*2); ctx.fill();
  // belt tails
  ctx.strokeStyle=beltCol; ctx.lineWidth=3; ctx.lineCap="round";
  ctx.beginPath();
  ctx.moveTo(hip[0]+face*2, hip[1]+1);
  ctx.lineTo(hip[0]+face*5, hip[1]+8);
  ctx.moveTo(hip[0]+face*2, hip[1]+1);
  ctx.lineTo(hip[0]-face*1, hip[1]+9);
  ctx.stroke();

  // ---- FRONT leg ----
  const legK = solveIK(hip[0],hip[1], fR[0],fR[1], L_THIGH,L_SHIN, face>0?-1:1);
  drawLimb(hip[0],hip[1], legK.kx,legK.ky, fR[0],fR[1], 12, giDark);
  // bare shin
  const shRx = lerp(legK.kx,fR[0],0.45), shRy = lerp(legK.ky,fR[1],0.45);
  drawLimb(shRx,shRy, fR[0],fR[1], 9, skin);
  drawFoot(fR[0],fR[1], face, skin);

  // ---- FRONT arm ----
  const aK = solveIK(shoulder[0],shoulder[1], hR[0],hR[1], L_UARM,L_FARM, face>0?1:-1);
  drawLimb(shoulder[0],shoulder[1], aK.kx,aK.ky, hR[0],hR[1], 10, gi);
  // bare forearm
  const faRx = lerp(aK.kx,hR[0],0.45), faRy = lerp(aK.ky,hR[1],0.45);
  drawLimb(faRx,faRy, hR[0],hR[1], 8, skin);
  drawFist(hR[0],hR[1], skin, gi);

  // ---- HEAD ----
  const hr2 = L_HEAD+1;
  // hair
  ctx.fillStyle=hairCol;
  ctx.beginPath(); ctx.arc(head[0], head[1]-1, hr2+1, Math.PI*1.05, Math.PI*1.95); ctx.fill();
  ctx.beginPath(); ctx.arc(head[0], head[1]-2, hr2, Math.PI*0.7, Math.PI*0.95, false); ctx.fill();
  // face
  ctx.fillStyle=skin;
  ctx.beginPath(); ctx.arc(head[0],head[1],hr2,0,Math.PI*2); ctx.fill();
  // headband
  ctx.fillStyle = f.isAI ? "#e22" : "#2a8";
  ctx.beginPath();
  ctx.arc(head[0],head[1]-3, hr2-0.5, Math.PI*0.85, Math.PI*2.15, false);
  ctx.lineTo(head[0]-face*(hr2+2), head[1]-4);
  ctx.lineTo(head[0]-face*(hr2+6), head[1]-1);
  ctx.lineTo(head[0]-face*(hr2+2), head[1]+1);
  ctx.closePath(); ctx.fill();
  // headband tail
  ctx.strokeStyle = f.isAI ? "#e22" : "#2a8"; ctx.lineWidth=2.5; ctx.lineCap="round";
  ctx.beginPath();
  ctx.moveTo(head[0]-face*(hr2+5), head[1]-1);
  ctx.lineTo(head[0]-face*(hr2+9), head[1]+3);
  ctx.lineTo(head[0]-face*(hr2+11), head[1]+8);
  ctx.stroke();
  // eye
  ctx.fillStyle="#222";
  ctx.beginPath(); ctx.arc(head[0]+face*3,head[1]-1,1.6,0,Math.PI*2); ctx.fill();
}

// yin-yang slot: fill 0 (empty), 0.5 (half = waza-ari), 1 (full = ippon)
function drawFullYinYang(cx,cy,r){
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle="#111"; ctx.fill();
  ctx.fillStyle="#eee";
  ctx.beginPath(); ctx.arc(cx,cy,r,-Math.PI/2,Math.PI/2); ctx.fill();
  ctx.fillStyle="#111";
  ctx.beginPath(); ctx.arc(cx,cy+r/2,r/2,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx,cy-r/2,r/2,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#eee"; ctx.beginPath(); ctx.arc(cx,cy+r/2,r/7,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#111"; ctx.beginPath(); ctx.arc(cx,cy-r/2,r/7,0,Math.PI*2); ctx.fill();
}
function drawYinYang(cx,cy,r,fill){
  ctx.save();
  if(fill<=0){
    ctx.strokeStyle="#555"; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
    ctx.restore(); return;
  }
  if(fill<1){
    ctx.globalAlpha=0.45; drawFullYinYang(cx,cy,r); ctx.globalAlpha=1;
    ctx.strokeStyle="#9bd"; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
  } else {
    drawFullYinYang(cx,cy,r);
  }
  ctx.restore();
}

function drawHUD(p1,p2,stage){
  // stage tag
  ctx.fillStyle="rgba(0,0,0,0.4)"; ctx.fillRect(W/2-90,12,180,30);
  ctx.fillStyle="#fff"; ctx.font="bold 16px monospace"; ctx.textAlign="center";
  ctx.fillText("STAGE "+stage+" — "+bgTheme(stage).name, W/2, 33);
  // yin-yangs
  ctx.textAlign="left"; ctx.fillStyle=p1.isAI?"#d04a4a":"#3a78d0";
  ctx.font="bold 13px monospace"; ctx.fillText("YOU", 30, 30);
  drawYinYang(70,52,12, clamp(p1.score,0,1)); drawYinYang(100,52,12, clamp(p1.score-1,0,1));
  ctx.textAlign="right"; ctx.fillStyle="#d04a4a";
  ctx.fillText("OPPONENT", W-30, 30);
  drawYinYang(W-70,52,12, clamp(p2.score,0,1)); drawYinYang(W-100,52,12, clamp(p2.score-1,0,1));
  // Jev status indicator
  if(JevAI.isEnabled()){
    const s = JevAI.getStatus();
    const col = s.status==="active" ? "#4f4" : "#f66";
    ctx.textAlign="right"; ctx.font="11px monospace"; ctx.fillStyle=col;
    ctx.fillText("JEV: " + s.status + (s.detail?" "+s.detail:""), W-30, H-12);
  } else {
    ctx.textAlign="right"; ctx.font="11px monospace"; ctx.fillStyle="#888";
    ctx.fillText("AI: local heuristic (press J for Jev setup)", W-30, H-12);
  }
  // autoplay indicator
  if(autoplay){
    ctx.textAlign="left"; ctx.font="11px monospace"; ctx.fillStyle="#fd4";
    ctx.fillText("AUTOPLAY (0 to toggle)", 30, H-12);
  }
}

// ============================================================
// AI
// ============================================================
function aiControl(f, opp, stage, dt){
  // difficulty scales per stage
  const react = clamp(0.52 - stage*0.08, 0.16, 0.52);
  f.ai = f.ai || { t:0, act:{}, blockTimer:0 };
  const a=f.ai; a.t-=dt;
  const d = Math.abs(opp.x - f.x);
  const out = { left:false,right:false,up:false,down:false,punch:false,kick:false };
  if(f.busy || f.stun>0){ return out; }
  if(a.t>0){
    // continue current micro-action
    return a.act;
  }
  a.t = react * (0.5 + Math.random()*0.8);
  const oppAttacking = (opp.state==="attack");
  const inRange = d < 92;
  const close = d < 60;
  const blockChance = clamp(0.18 + stage*0.12, 0.18, 0.6);
  const aggro = clamp(0.3 + stage*0.15, 0.3, 0.95);
  const toward = opp.x >= f.x ? "right" : "left";
  const away = toward==="right" ? "left":"right";

  if(oppAttacking && inRange && Math.random()<blockChance){
    // block: hold away + down
    out[away]=true; out.down=true; a.act=out; a.t=Math.max(a.t,0.18); return out;
  }
  if(inRange && Math.random()<aggro){
    // attack: choose by spacing
    const r = Math.random();
    if(f.y<GROUND_Y-1){
      if(r<0.3){ out.kick=true; out[toward]=true; }     // jump roundhouse
      else { out.kick=true; }                            // jump kick
    }
    else if(d>72){ out.kick=true; out[toward]=true; }   // roundhouse
    else if(r<0.2){ out.down=true; out[away]=true; out.kick=true; } // sweep
    else if(r<0.35){ out[toward]=true; out.punch=true; }           // elbow
    else if(r<0.55){ out.down=true; out.kick=true; }   // low kick
    else if(r<0.75){ out.kick=true; }                   // high kick
    else { out.punch=true; }                            // punch
    a.act=out; return out;
  }
  if(d>96){
    out[toward]=true;                                   // approach
  } else if(d<46 && Math.random()<0.3){
    out[away]=true;                                     // space out
  } else if(Math.random()<0.2){
    out.up=true;                                        // occasional jump
  } else {
    // idle / jitter
    if(Math.random()<0.3) out[toward]=true;
  }
  a.act=out; return out;
}

// ============================================================
// Game state machine
// ============================================================
let p1, p2, stage, mode, timer, msg, msgSub, pause;
let showJevLog = false;
let autoplay = false;
let bull = null;   // bonus round bull object
function resetBout(){
  p1 = makeFighter(300, 1, false); p1.name="YOU";
  p2 = makeFighter(660,-1, true);  p2.name="AI";
  timer=0; msg=""; msgSub="";
}
function startStage(s){
  stage=s; resetBout(); mode="fighting"; JevAI.reset();
}
function startGame(){
  stage=1; resetBout(); mode="title";
}

// ---- Bull bonus round ----
function startBonus(){
  // player stands center-left, no opponent
  p1.x = 300; p1.y = GROUND_Y; p1.vy = 0; p1.move = null; p1.busy = false;
  p1.state = "idle"; p1.stun = 0; p1.pose = clonePose(POSES.IDLE);
  p1.facing = 1;
  bull = {
    x: W + 80, y: GROUND_Y,
    vx: -340,
    state: "charging",       // charging | hit | missed
    t: 0,
    scored: false,
  };
  mode = "bonusIntro";
  timer = 2.0;
  msg = "BONUS ROUND";
  msgSub = "Knock out the bull with one strike!";
}
function updateBonus(dt){
  if(mode === "bonusIntro"){
    timer -= dt;
    if(timer <= 0){ mode = "bonusFight"; timer = 0; msg = ""; msgSub = ""; }
    return;
  }
  if(mode === "bonusResult"){
    timer -= dt;
    if(timer <= 0){
      bull = null;
      startStage(stage + 1);
    }
    return;
  }
  if(mode !== "bonusFight") return;

  // player can act (movement + attacks, no opponent)
  updateFighter(p1, {x: bull.x, y: bull.y}, dt, null);
  // keep player facing right (bull comes from right)
  if(!p1.busy) p1.facing = 1;
  blendPose(p1, poseFor(p1), dt);

  // bull physics
  bull.x += bull.vx * dt;
  bull.t += dt;

  // check player attack vs bull
  if(p1.move && p1.move.phase === "active" && !p1.move.spent){
    const m = MOVES[p1.move.key];
    const airOff = GROUND_Y - p1.y;
    const y0 = m.hb[0] - airOff, y1 = m.hb[1] - airOff;
    // bull body box: roughly ground level to 70px up
    const by0 = bull.y - 70, by1 = bull.y;
    const fdist = p1.facing * (bull.x - p1.x);
    if(fdist >= 30 && fdist <= m.reach + 20 && y0 < by1 && y1 > by0){
      p1.move.spent = true;
      bull.state = "hit";
      bull.vx = -60; // stagger back
      bull.scored = true;
      mode = "bonusResult";
      timer = 2.5;
      msg = "BULL DOWN!";
      msgSub = "Mas Oyama would be proud. Bonus yin-yang awarded.";
      p1.score += 0.5; // bonus half-point toward next bout
      Sound.win();
      return;
    }
  }

  // bull reaches player without being hit
  const dx = Math.abs(bull.x - p1.x);
  if(dx < 30 && !bull.scored){
    bull.state = "missed";
    bull.vx = -80;
    mode = "bonusResult";
    timer = 2.0;
    msg = "TRAMPLED!";
    msgSub = "The bull got past. No bonus.";
    p1.state = "hit"; p1.stun = 0.5;
    Sound.lose();
    return;
  }

  // bull exits left side
  if(bull.x < -80){
    bull.state = "missed";
    mode = "bonusResult";
    timer = 1.5;
    msg = "MISSED!";
    msgSub = "The bull escaped. No bonus.";
    Sound.lose();
    return;
  }
}

function drawBull(){
  if(!bull) return;
  const b = bull;
  const bx = b.x, by = b.y;
  const charge = b.state === "charging" ? 1 : 0;
  const shake = charge ? Math.sin(b.t * 40) * 2 : 0;

  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath(); ctx.ellipse(bx, by + 4, 50, 8, 0, 0, Math.PI * 2); ctx.fill();

  // body (facing left, charging toward player)
  ctx.save();
  ctx.translate(bx + shake, by);
  ctx.scale(-1, 1);   // flip so head/horns face left (direction of charge)

  // legs (animated gallop)
  const legPhase = Math.sin(b.t * 18);
  ctx.strokeStyle = "#3a2a1a"; ctx.lineWidth = 10; ctx.lineCap = "round";
  // back legs
  ctx.beginPath(); ctx.moveTo(-15, -30); ctx.lineTo(-15 + legPhase * 6, -2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-8, -30); ctx.lineTo(-8 - legPhase * 6, -2); ctx.stroke();
  // front legs
  ctx.beginPath(); ctx.moveTo(28, -30); ctx.lineTo(28 - legPhase * 6, -2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(35, -30); ctx.lineTo(35 + legPhase * 6, -2); ctx.stroke();

  // body
  ctx.fillStyle = "#4a3a2a";
  ctx.beginPath(); ctx.ellipse(10, -35, 38, 24, 0, 0, Math.PI * 2); ctx.fill();
  // back hump
  ctx.beginPath(); ctx.ellipse(-10, -50, 16, 12, 0, 0, Math.PI * 2); ctx.fill();

  // head + horns (facing left)
  ctx.fillStyle = "#3a2a1a";
  ctx.beginPath(); ctx.ellipse(42, -48, 16, 14, 0, 0, Math.PI * 2); ctx.fill();
  // snout
  ctx.beginPath(); ctx.ellipse(54, -42, 8, 6, 0, 0, Math.PI * 2); ctx.fill();
  // nostril
  ctx.fillStyle = "#1a0a00";
  ctx.beginPath(); ctx.arc(58, -42, 1.5, 0, Math.PI * 2); ctx.fill();
  // eye (angry)
  ctx.fillStyle = "#e22";
  ctx.beginPath(); ctx.arc(40, -52, 2, 0, Math.PI * 2); ctx.fill();
  // horns
  ctx.strokeStyle = "#d8c8a0"; ctx.lineWidth = 5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(38, -60); ctx.lineTo(28, -72); ctx.lineTo(22, -68); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(46, -60); ctx.lineTo(52, -74); ctx.lineTo(58, -70); ctx.stroke();

  // tail
  ctx.strokeStyle = "#3a2a1a"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-28, -38); ctx.lineTo(-40 + Math.sin(b.t*15)*4, -28); ctx.stroke();

  // steam/snort puffs when charging
  if(charge){
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    for(let i=0;i<3;i++){
      const px = 62 + i*8 + Math.sin(b.t*10+i)*3;
      const py = -42 + Math.sin(b.t*8+i)*3;
      ctx.beginPath(); ctx.arc(px, py, 3 - i*0.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  if(b.state === "hit"){
    // dazed stars
    ctx.fillStyle = "#ffd17a";
    ctx.font = "16px monospace"; ctx.textAlign = "center";
    ctx.fillText("* * *", 10, -78);
  }

  ctx.restore();
}
startGame();

// pose blending
function poseFor(f){
  if(f.state==="attack" && f.move){ return POSES[MOVES[f.move.key].pose]; }
  if(f.state==="hit") return POSES.HIT;
  if(f.state==="block") return POSES.BLOCK;
  if(f.state==="crouch") return POSES.CROUCH;
  if(f.state==="jump" || f.y<GROUND_Y-1) return POSES.JUMP_IDLE;
  if(f.state==="walk"){
    const s=Math.sin(f.walkPhase)*0.5+0.5;
    const base=POSES.IDLE;
    return {
      hipYoff:base.hipYoff, lean:0.1,
      hR:{x:lerp(20,-4,s), y:-8}, hL:{x:lerp(-20,4,s), y:-6},
      fR:{x:lerp(28,-4,s), y:50}, fL:{x:lerp(-28,4,s), y:50},
    };
  }
  return POSES.IDLE;
}
function blendPose(f, target, dt){
  const rate = (f.state==="attack") ? 0.55 : 0.28;
  const t = 1 - Math.pow(1-rate, dt*60);
  const p=f.pose;
  p.hipYoff = lerp(p.hipYoff, target.hipYoff, t);
  p.lean = lerp(p.lean, target.lean, t);
  p.hR=lerpPt(p.hR,target.hR,t); p.hL=lerpPt(p.hL,target.hL,t);
  p.fR=lerpPt(p.fR,target.fR,t); p.fL=lerpPt(p.fL,target.fL,t);
}

// round resolution
function endRound(winner, award, label){
  mode="roundPause"; timer=1.4; msg=label;
  if(winner){ winner.score += award; winner.flash=0.2; Sound.point(); }
  // loser stagger
  const loser = winner===p1?p2:p1;
  if(winner){ loser.state="hit"; loser.stun=0.5; loser.move=null; loser.busy=false; }
  // nudge apart
  if(winner){
    const dir = loser.x>=winner.x?1:-1;
    loser.x = clamp(loser.x+dir*10, ARENA_L, ARENA_R);
  }
}
function nextOrEnd(){
  if(p1.score>=POINTS_TO_WIN){
    if(stage>=4){ mode="champion"; Sound.win(); }
    else if(stage===2 && !autoplay){ startBonus(); }
    else { mode="stageClear"; timer=1.8; msg="STAGE CLEAR"; Sound.win(); }
  } else if(p2.score>=POINTS_TO_WIN){
    mode="gameover"; Sound.lose();
  } else {
    // continue same bout: reset positions/poses, keep scores
    p1.x=300; p1.y=GROUND_Y; p1.vy=0; p1.move=null; p1.busy=false; p1.state="idle"; p1.stun=0; p1.pose=clonePose(POSES.IDLE);
    p2.x=660; p2.y=GROUND_Y; p2.vy=0; p2.move=null; p2.busy=false; p2.state="idle"; p2.stun=0; p2.pose=clonePose(POSES.IDLE); p2.ai=null;
    JevAI.reset();
    mode="fighting";
  }
}

// ============================================================
// Main loop
// ============================================================
let last=performance.now();
function loop(now){
  let dt=(now-last)/1000; last=now; dt=Math.min(dt,0.033);
  if(kPress("start") && (mode==="title"||mode==="gameover"||mode==="champion")){
    if(mode==="title") startStage(1);
    else startGame();
  }
  if(Pressed["KeyP"] && mode==="fighting"){ pause=!pause; }

  if(!pause) { try { update(dt); } catch(e){ console.error("update:",e); } }
  try { draw(); } catch(e){ console.error("draw:",e); }
  for(const k2 in Pressed) delete Pressed[k2];
  requestAnimationFrame(loop);
}

function separateFighters(a, b){
  const minDist = 44;             // body half-widths combined
  const dx = b.x - a.x;
  const dist = Math.abs(dx);
  if(dist >= minDist) return;
  const overlap = minDist - dist;
  const dir = dx >= 0 ? 1 : -1;    // push b in +dir, a in -dir
  // don't push during round pause / hit-stun (let stagger anim play)
  const aFixed = (a.stun > 0.25);
  const bFixed = (b.stun > 0.25);
  if(aFixed && bFixed) return;
  if(aFixed){ b.x += dir * overlap; }
  else if(bFixed){ a.x -= dir * overlap; }
  else {
    a.x -= dir * overlap * 0.5;
    b.x += dir * overlap * 0.5;
  }
  a.x = clamp(a.x, ARENA_L, ARENA_R);
  b.x = clamp(b.x, ARENA_L, ARENA_R);
}

function update(dt){
  if(mode==="title"||mode==="gameover"||mode==="champion") return;
  if(mode==="stageClear"){ timer-=dt; if(timer<=0) startStage(stage+1); return; }
  if(mode==="roundPause"){ timer-=dt; if(timer<=0) nextOrEnd(); return; }
  if(mode==="bonusIntro"||mode==="bonusFight"||mode==="bonusResult"){ updateBonus(dt); return; }
  if(mode!=="fighting") return;

  // AI control: Jev if enabled, otherwise local heuristic
  const aiFallback = ()=> aiControl(p2,p1,stage,dt);
  const ai = JevAI.tick(p2, p1, stage, dt, aiFallback);
  // p1: Jev-controlled when autoplay is on, otherwise human input (null)
  const p1Fallback = ()=> aiControl(p1,p2,stage,dt);
  const p1ctl = (autoplay && JevAI.p1) ? JevAI.p1.tick(p1, p2, stage, dt, p1Fallback) : null;
  updateFighter(p1,p2,dt,p1ctl);
  updateFighter(p2,p1,dt,ai);

  // body collision: keep fighters from overlapping
  separateFighters(p1, p2);

  // hit resolution: attacker's active frames
  checkHit(p1,p2); checkHit(p2,p1);

  // blend poses
  blendPose(p1, poseFor(p1), dt);
  blendPose(p2, poseFor(p2), dt);
}

function checkHit(atk,def){
  if(mode!=="fighting") return;
  const r=resolveHit(atk,def);
  if(!r) return;
  if(r.type==="block"){
    atk.move=null; atk.busy=false; atk.stun=0.22; atk.state="hit"; atk.flash=0.15;
    def.stun=0.12; Sound.block();
    // small pushback
    const dir=def.x>=atk.x?1:-1; def.x=clamp(def.x+dir*6,ARENA_L,ARENA_R);
    return;
  }
  // hit landed
  const winner=atk, pts=r.pts;
  const label = pts>=1 ? "IPPON!" : "WAZA-ARI";
  atk.move=null; atk.busy=false;
  endRound(winner, pts, label);
}

function draw(){
  drawBackground(stage);
  if(mode==="bonusIntro"||mode==="bonusFight"||mode==="bonusResult"){
    drawFighter(p1);
    drawBull();
    drawHUD(p1, {score:0, isAI:true}, stage);
    if(mode==="bonusIntro") drawCenter(msg, msgSub, "#ffd17a");
    else if(mode==="bonusResult") drawCenter(msg, msgSub, bull && bull.scored ? "#4f4" : "#f66");
  } else {
    drawFighter(p1); drawFighter(p2);
    drawHUD(p1,p2,stage);
  }

  if(mode==="title") drawTitle();
  else if(mode==="gameover") drawCenter("GAME OVER","Press Enter to fight again", "#d04a4a");
  else if(mode==="champion") drawCenter("YOU ARE THE MASTER","Press Enter to fight again", "#ffd17a");
  else if(mode==="stageClear") drawCenter(msg,"", "#ffd17a");
  else if(mode==="roundPause") drawCenter(msg,"", msg==="IPPON!"?"#ffd17a":"#9bd");
  if(pause && mode==="fighting") drawCenter("PAUSED","Press P to resume","#fff");
  if(showJevLog) drawJevLogPanel();
}

function drawJevLogPanel(){
  const entries = JevAI.getLog();
  const x = W - 380, y = 70, pw = 360, ph = H - 100;
  const maxLines = Math.floor((ph - 40) / 14);
  const visible = entries.slice(-maxLines);

  ctx.fillStyle = "rgba(0,0,0,0.78)";
  ctx.fillRect(x, y, pw, ph);
  ctx.strokeStyle = "#555"; ctx.lineWidth = 1;
  ctx.strokeRect(x, y, pw, ph);

  // header
  ctx.textAlign = "left"; ctx.font = "bold 11px monospace"; ctx.fillStyle = "#9bd";
  ctx.fillText("JEV LOG (L to close)", x + 8, y + 16);
  ctx.fillStyle = "#666"; ctx.font = "10px monospace";
  ctx.fillText(entries.length + " entries", x + pw - 70, y + 16);

  // entries
  ctx.font = "10px monospace";
  for(let i = 0; i < visible.length; i++){
    const e = visible[i];
    const ly = y + 30 + i * 14;
    const time = new Date(e.t).toLocaleTimeString("en", { hour12: false }) + "." + String(e.t % 1000).padStart(3, "0");
    const col = e.ok ? "#7e7" : "#e77";
    ctx.fillStyle = "#666";
    ctx.fillText(time, x + 8, ly);
    if(e.ok){
      ctx.fillStyle = col;
      ctx.fillText((e.id||"?") + " " + e.choice, x + 60, ly);
      ctx.fillStyle = "#999";
      ctx.fillText(e.confidence.toFixed(2), x + 180, ly);
      ctx.fillStyle = "#555";
      ctx.fillText("S" + e.stage, x + 220, ly);
      // top alternative from probabilities
      if(e.probabilities){
        const sorted = Object.entries(e.probabilities).sort((a,b)=>b[1]-a[1]);
        const alt = sorted[1] ? sorted[1][0] + " " + sorted[1][1].toFixed(2) : "";
        ctx.fillStyle = "#555";
        ctx.fillText(alt, x + 248, ly);
      }
    } else {
      ctx.fillStyle = col;
      const reason = e.reason || (e.choice ? "low_conf " + e.confidence.toFixed(2) : "error");
      ctx.fillText(reason, x + 92, ly);
      ctx.fillStyle = "#555";
      ctx.fillText("S" + e.stage, x + 220, ly);
    }
  }

  // footer hint
  ctx.fillStyle = "#444"; ctx.font = "10px monospace";
  ctx.fillText("console: window.jevLog()  window.jevClear()", x + 8, y + ph - 8);
}

function drawTitle(){
  ctx.fillStyle="rgba(0,0,0,0.55)"; ctx.fillRect(0,0,W,H);
  ctx.textAlign="center";
  ctx.fillStyle="#ffd17a"; ctx.font="bold 40px monospace";
  ctx.fillText("THE WAY OF THE EXPLODING FIGHT", W/2, 150);
  ctx.fillStyle="#fff"; ctx.font="16px monospace";
  ctx.fillText("A one-on-one karate bout. First to two yin-yangs wins.", W/2, 188);
  ctx.font="14px monospace"; ctx.fillStyle="#cdd9e6";
  const lines=[
    "Move:  Arrow Left / Right      (or A / D)",
    "Jump:  Arrow Up                 Crouch: Arrow Down",
    "Punch: F       Kick: G          Block: hold back + down",
    "Low attack: hold Down.   Roundhouse: Kick + toward.   Jump kick: Kick in air.",
    "Elbow: Punch + toward.   Sweep: Kick + down + back.   Back kick: Kick + back.",
    "Jump roundhouse: Jump, then Kick + toward.",
    "",
    "Press ENTER to begin",
  ];
  lines.forEach((l,i)=>ctx.fillText(l,W/2,230+i*26));
  ctx.fillStyle="#888"; ctx.font="12px monospace";
  ctx.fillText("M mutes   P pauses   J Jev key   L Jev log   0 autoplay", W/2, H-30);
}
function drawCenter(t,sub,col){
  ctx.fillStyle="rgba(0,0,0,0.5)"; ctx.fillRect(0,H/2-70,W,140);
  ctx.textAlign="center"; ctx.fillStyle=col; ctx.font="bold 38px monospace";
  ctx.fillText(t,W/2,H/2);
  if(sub){ ctx.fillStyle="#fff"; ctx.font="16px monospace"; ctx.fillText(sub,W/2,H/2+34); }
}

requestAnimationFrame(loop);
