"use strict";
// Minimal local server for The Way of the Exploding Fight.
// Serves static files and proxies POST /jev -> TypeSafe System One API.
// Usage:  node server.js   then open http://localhost:3000
//
// Local AI backend: set OLLAMA_MODEL (e.g. nimble:latest) to answer /jev
// from a local Ollama model instead of the TypeSafe API. The model is
// asked for a JSON move choice and the reply is reshaped into the Jev
// response format, so the game needs no changes.
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = 3000;
const TS_HOST = "api.typesafe.ai";
const TS_PATH = "/v1/systemone";
// Optional: set TYPESAFE_API_KEY to let the server inject the key for
// development, programmatic use, and testing. A browser-supplied
// Authorization header always takes precedence.
const ENV_KEY = process.env.TYPESAFE_API_KEY || "";
// Optional: set OLLAMA_MODEL (e.g. nimble:latest) to serve /jev from a
// local Ollama model. Takes precedence over the TypeSafe proxy.
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "";
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const OLLAMA_URL = new URL(OLLAMA_HOST);
// Bind to loopback by default so the game and any injected API key are
// not exposed to the LAN. Set HOST=0.0.0.0 to serve the network.
const HOST = process.env.HOST || "127.0.0.1";

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const ROOT = __dirname;

function serveStatic(req, res) {
  let url = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const file = path.join(ROOT, path.normalize(url).replace(/^(\.\.[\/\\])+/, ""));
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function proxyJev(req, res) {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const headers = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    };
    // Forward Authorization header from the browser request
    const auth = req.headers["authorization"];
    if (auth) headers["Authorization"] = auth;
    else if (ENV_KEY) headers["Authorization"] = "Bearer " + ENV_KEY;

    const upstream = https.request(
      { host: TS_HOST, path: TS_PATH, method: "POST", headers },
      (up) => {
        res.writeHead(up.statusCode || 502, {
          "Content-Type": up.headers["content-type"] || "application/json",
        });
        up.pipe(res);
      }
    );
    upstream.on("error", (e) => {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "proxy_error", detail: String(e.message) }));
    });
    upstream.end(body);
  });
}

// POST a JSON body to the Ollama chat API, honoring the OLLAMA_HOST
// protocol (http or https) and its implied default port.
function ollamaPost(body, onReply) {
  const isTLS = OLLAMA_URL.protocol === "https:";
  const lib = isTLS ? https : http;
  const req = lib.request(
    {
      host: OLLAMA_URL.hostname,
      port: OLLAMA_URL.port || (isTLS ? 443 : 11434),
      path: "/api/chat",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    },
    onReply
  );
  req.on("error", () => {});
  req.end(body);
  return req;
}

// Answer a /jev request from a local Ollama model. The game sends a Jev
// System One request: { model, state, questions: { action: { type:
// "choice", instructions, criteria } } }. We turn that into a chat
// prompt with a JSON-schema-constrained answer and reshape the reply
// into the Jev response shape the game expects.
function ollamaJev(req, res) {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    let jevReq;
    try {
      jevReq = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "bad_request", detail: "invalid JSON" }));
      return;
    }
    const q = jevReq.questions && jevReq.questions.action;
    // criteria is an object {move: description} from the game, or an
    // array of move names from hand-rolled requests.
    const rawCriteria = q && q.criteria;
    const instructions = (q && q.instructions) || "Which move should the fighter make right now?";
    let moves = [];
    let moveHelp = "";
    if (Array.isArray(rawCriteria)) {
      moves = rawCriteria;
    } else if (rawCriteria && typeof rawCriteria === "object") {
      moves = Object.keys(rawCriteria);
      moveHelp = "Allowed moves: " + moves.map((m) => m + " (" + rawCriteria[m] + ")").join("; ") + ". ";
    }
    if (moves.length === 0) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "bad_request", detail: "no criteria" }));
      return;
    }

    const payload = {
      model: OLLAMA_MODEL,
      stream: false,
      think: false,
      messages: [
        {
          role: "system",
          content:
            "You are the AI controller for a one-on-one karate game. " +
            "You are given the current game state and must pick exactly one move. " +
            moveHelp +
            instructions + " " +
            "Answer only with JSON: {\"choice\": \"<one of the allowed moves>\", \"confidence\": <0..1>}.",
        },
        { role: "user", content: String(jevReq.state || "") },
      ],
      format: {
        type: "object",
        properties: {
          choice: { type: "string", enum: moves },
          confidence: { type: "number" },
        },
        required: ["choice"],
      },
      options: { num_predict: 64, temperature: 0.8 },
    };
    const body = JSON.stringify(payload);
    const upstream = ollamaPost(body, (up) => {
        const parts = [];
        up.on("data", (d) => parts.push(d));
        up.on("end", () => {
          if (up.statusCode !== 200) {
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "ollama_error", detail: "HTTP " + up.statusCode }));
            return;
          }
          let reply;
          try {
            reply = JSON.parse(Buffer.concat(parts).toString("utf8"));
          } catch (e) {
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "ollama_error", detail: "invalid reply" }));
            return;
          }
          let answer;
          try {
            answer = JSON.parse(reply.message && reply.message.content || "{}");
          } catch (e) {
            answer = {};
          }
          const choice = moves.includes(answer.choice) ? answer.choice : moves[0];
          const confidence =
            typeof answer.confidence === "number" && answer.confidence > 0 && answer.confidence <= 1
              ? answer.confidence
              : 0.9;
          // Synthesize a peaked distribution over the allowed moves so the
          // game's temperature sampling keeps play varied.
          const probabilities = {};
          const rest = moves.filter((c) => c !== choice);
          const share = 0.5 / Math.max(rest.length, 1);
          probabilities[choice] = rest.length > 0 ? 0.5 : 1;
          for (const c of rest) probabilities[c] = share;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            answers: {
              action: { choice, confidence, probabilities },
            },
          }));
        });
      }
    );
    upstream.on("error", (e) => {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "ollama_error", detail: String(e.message) }));
    });
  });
}

// Fire one tiny generation at startup so the model is loaded into memory
// before the first game poll (a cold load can take tens of seconds).
function warmOllama() {
  const body = JSON.stringify({
    model: OLLAMA_MODEL,
    stream: false,
    think: false,
    messages: [{ role: "user", content: "OK" }],
    options: { num_predict: 1 },
  });
  ollamaPost(body, (up) => { up.resume(); });
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/jev") {
    if (OLLAMA_MODEL) return ollamaJev(req, res);
    return proxyJev(req, res);
  }
  if (req.method === "GET" && req.url === "/jevstatus") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ serverKey: !!ENV_KEY || !!OLLAMA_MODEL, backend: OLLAMA_MODEL ? "ollama:" + OLLAMA_MODEL : "typesafe" }));
    return;
  }
  return serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log("The Way of the Exploding Fight");
  console.log("Open http://" + HOST + ":" + PORT);
  if (OLLAMA_MODEL) {
    console.log("AI backend: Ollama model " + OLLAMA_MODEL + " at " + OLLAMA_HOST);
    warmOllama();
  } else {
    console.log("Jev proxy: POST /jev -> https://" + TS_HOST + TS_PATH);
  }
});
