"use strict";
// Reproducible decision-model benchmark for the Fight state contract.
// Usage: node benchmark.js nimble:latest tev1:latest tev1:0.8b

const ACTIONS = {
  approach: "Move toward the opponent to close distance",
  retreat: "Step away from the opponent to create space",
  block: "Hold back and down to block incoming attacks",
  jump: "Jump into the air",
  punch_high: "Throw a high punch to the head",
  punch_low: "Throw a low punch to the body",
  elbow: "Step in and strike with the elbow, very short range but always scores a full point",
  kick_high: "Throw a high kick to the head",
  kick_low: "Throw a low kick to the legs",
  sweep: "Drop low and sweep the opponent's legs, slow but always scores a full point",
  roundhouse: "Throw a powerful roundhouse kick, step toward and kick",
  back_kick: "Kick backward while stepping away, good for spacing",
  jump_kick: "Jump and kick in the air",
  jump_round: "Jump toward the opponent and roundhouse kick in the air",
  wait: "Hold position and observe",
};
const ACTION_NAMES = new Set(Object.keys(ACTIONS));
const OLLAMA_HOST = (process.env.OLLAMA_HOST || "http://localhost:11434").replace(/\/$/, "");
const RUNS = Number(process.env.BENCHMARK_RUNS || 3);
const TIMEOUT_MS = Number(process.env.BENCHMARK_TIMEOUT_MS || 10000);
const MODELS = process.argv.slice(2);

const SITUATIONS = [
  [1, "My score: 0.0. Opponent score: 0.0. Distance between fighters: 150 pixels. We are at far range — approach quickly, do not jump. My stance: idle. Opponent stance: idle. I am near my left wall. The opponent is in the center. Opponent is not attacking — this is my chance to strike. I am free to act."],
  [1, "My score: 0.0. Opponent score: 0.5. Distance between fighters: 82 pixels. We are at kick range — use high kicks, roundhouses, or low kicks. My stance: idle. Opponent stance: walk. I am in the center of the arena. The opponent is in the center. Opponent is not attacking — this is my chance to strike. I am free to act."],
  [1, "My score: 0.5. Opponent score: 0.5. Distance between fighters: 55 pixels. We are at punch range — use punches or step in for elbow. My stance: idle. Opponent stance: attack. I am in the center of the arena. The opponent is in the center. Opponent is attacking — block or counter now. I am free to act."],
  [1, "My score: 1.5. Opponent score: 1.0. Distance between fighters: 42 pixels. We are at close range — use elbows, low punches, or sweeps. My stance: crouch(crouching). Opponent stance: idle. I am in the center of the arena. The opponent is near the right wall. Opponent is not attacking — this is my chance to strike. I am free to act."],
  [2, "My score: 0.0. Opponent score: 0.0. Distance between fighters: 105 pixels. We are at far range — approach quickly, do not jump. My stance: walk. Opponent stance: idle. I am in the center of the arena. The opponent is in the center. Opponent is not attacking — this is my chance to strike. I am free to act."],
  [2, "My score: 0.5. Opponent score: 1.0. Distance between fighters: 68 pixels. We are at punch range — use punches or step in for elbow. My stance: block. Opponent stance: attack. I am near my left wall. The opponent is in the center. Opponent is attacking — block or counter now. I am free to act."],
  [2, "My score: 1.0. Opponent score: 1.0. Distance between fighters: 76 pixels. We are at kick range — use high kicks, roundhouses, or low kicks. My stance: jump(airborne). Opponent stance: idle. I am in the center of the arena. The opponent is in the center. Opponent is not attacking — this is my chance to strike. I am free to act."],
  [2, "My score: 1.5. Opponent score: 1.5. Distance between fighters: 48 pixels. We are at close range — use elbows, low punches, or sweeps. My stance: idle. Opponent stance: crouch(crouching). I am in the center of the arena. The opponent is near the right wall. Opponent is not attacking — this is my chance to strike. I am free to act."],
  [3, "My score: 0.0. Opponent score: 0.5. Distance between fighters: 135 pixels. We are at far range — approach quickly, do not jump. My stance: idle. Opponent stance: walk. I am near my right wall. The opponent is in the center. Opponent is not attacking — this is my chance to strike. I am free to act."],
  [3, "My score: 0.5. Opponent score: 1.0. Distance between fighters: 88 pixels. We are at kick range — use high kicks, roundhouses, or low kicks. My stance: idle. Opponent stance: attack. I am in the center of the arena. The opponent is in the center. Opponent is attacking — block or counter now. I am free to act."],
  [3, "My score: 1.0. Opponent score: 1.5. Distance between fighters: 58 pixels. We are at punch range — use punches or step in for elbow. My stance: crouch(crouching). Opponent stance: block. I am in the center of the arena. The opponent is in the center. Opponent is not attacking — this is my chance to strike. I am free to act."],
  [3, "My score: 1.5. Opponent score: 1.5. Distance between fighters: 39 pixels. We are at close range — use elbows, low punches, or sweeps. My stance: idle. Opponent stance: attack. I am near my left wall. The opponent is in the center. Opponent is attacking — block or counter now. I am free to act."],
  [4, "My score: 0.0. Opponent score: 0.0. Distance between fighters: 118 pixels. We are at far range — approach quickly, do not jump. My stance: idle. Opponent stance: idle. I am in the center of the arena. The opponent is near the right wall. Opponent is not attacking — this is my chance to strike. I am free to act."],
  [4, "My score: 0.5. Opponent score: 1.0. Distance between fighters: 73 pixels. We are at kick range — use high kicks, roundhouses, or low kicks. My stance: walk. Opponent stance: attack. I am in the center of the arena. The opponent is in the center. Opponent is attacking — block or counter now. I am free to act."],
  [4, "My score: 1.0. Opponent score: 1.5. Distance between fighters: 52 pixels. We are at punch range — use punches or step in for elbow. My stance: block. Opponent stance: crouch(crouching). I am near my right wall. The opponent is in the center. Opponent is not attacking — this is my chance to strike. I am free to act."],
  [4, "My score: 1.5. Opponent score: 1.5. Distance between fighters: 36 pixels. We are at close range — use elbows, low punches, or sweeps. My stance: idle. Opponent stance: attack. I am in the center of the arena. The opponent is in the center. Opponent is attacking — block or counter now. I am free to act."],
].map(([stage, detail]) => ({
  stage,
  state: [
    "Karate bout. Yin-yang scoring: clean hit = ippon (1pt), glancing = waza-ari (0.5pt). First to 2 points wins.",
    "Stage " + stage + " of 4. Higher stages have faster opponents.",
    detail,
    "I have not acted yet.",
    "My fighting style: balanced tournament fighter. Choose the tactically strongest legal move.",
  ].join(" "),
}));

function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

async function decide(model, situation, timeoutMs = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(OLLAMA_HOST + "/v1/systemone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        state: situation.state,
        questions: {
          action: {
            type: "choice",
            instructions: "Which move should the fighter make right now?",
            criteria: ACTIONS,
          },
        },
      }),
      signal: ctrl.signal,
    });
    if (!response.ok) throw new Error("HTTP " + response.status + ": " + await response.text());
    const data = await response.json();
    const answer = data.answers && data.answers.action;
    if (!answer || !ACTION_NAMES.has(answer.choice)) throw new Error("invalid action response");
    const confidence = Number(answer.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error("invalid confidence");
    }
    return {
      choice: answer.choice,
      confidence,
      duration: performance.now() - started,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function benchmark(model) {
  process.stderr.write("Warming " + model + "...\n");
  await decide(model, SITUATIONS[0], 120000);
  const results = [];
  for (let run = 0; run < RUNS; run++) {
    for (const situation of SITUATIONS) {
      process.stderr.write(model + " run " + (run + 1) + "/" + RUNS + " stage " + situation.stage + "\r");
      try {
        results.push({ ...(await decide(model, situation)), ok: true });
      } catch (error) {
        results.push({ ok: false, error: String(error.message || error), duration: TIMEOUT_MS });
      }
    }
  }
  process.stderr.write(" ".repeat(80) + "\r");
  const valid = results.filter((result) => result.ok);
  const durations = valid.map((result) => result.duration).sort((a, b) => a - b);
  const confidences = valid.map((result) => result.confidence).filter(Number.isFinite);
  return {
    model,
    decisions: results.length,
    valid: valid.length,
    meanMs: durations.reduce((sum, value) => sum + value, 0) / Math.max(durations.length, 1),
    p50Ms: percentile(durations, 0.50),
    p95Ms: percentile(durations, 0.95),
    maxMs: durations[durations.length - 1] || 0,
    meanConfidence: confidences.reduce((sum, value) => sum + value, 0) / Math.max(confidences.length, 1),
    fallbackRate: results.filter((result) => !result.ok || result.confidence < 0.3 || result.duration > 3000).length / results.length,
    lowConfidenceRate: valid.filter((result) => result.confidence < 0.3).length / results.length,
    slowRate: valid.filter((result) => result.duration > 3000).length / results.length,
    errors: results.length - valid.length,
    uniqueMoves: new Set(valid.map((result) => result.choice)).size,
  };
}

async function main() {
  if (MODELS.length === 0 || !Number.isInteger(RUNS) || RUNS < 1 ||
      !Number.isFinite(TIMEOUT_MS) || TIMEOUT_MS <= 0) {
    console.error("Usage: node benchmark.js <model> [model ...]");
    console.error("Optional env: BENCHMARK_RUNS=3 BENCHMARK_TIMEOUT_MS=10000 OLLAMA_HOST=http://localhost:11434");
    process.exitCode = 1;
    return;
  }
  const results = [];
  for (const model of MODELS) results.push(await benchmark(model));
  console.log("| Model | Decisions | Mean | p50 | p95 | Max | Mean confidence | Low conf | Slow | Errors | Fallback | Unique moves |");
  console.log("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const result of results) {
    console.log(
      "| " + result.model +
      " | " + result.decisions +
      " | " + result.meanMs.toFixed(0) + "ms" +
      " | " + result.p50Ms.toFixed(0) + "ms" +
      " | " + result.p95Ms.toFixed(0) + "ms" +
      " | " + result.maxMs.toFixed(0) + "ms" +
      " | " + result.meanConfidence.toFixed(3) +
      " | " + (result.lowConfidenceRate * 100).toFixed(1) + "%" +
      " | " + (result.slowRate * 100).toFixed(1) + "%" +
      " | " + result.errors +
      " | " + (result.fallbackRate * 100).toFixed(1) + "%" +
      " | " + result.uniqueMoves + " |"
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
