"use strict";
// Minimal local server for The Way of the Exploding Fight.
// Serves static files and proxies POST /jev -> TypeSafe System One API.
// Usage:  node server.js   then open http://localhost:3000
//
// Local AI backend: set OLLAMA_MODEL (e.g. nimble:latest) to answer /jev
// from a local Ollama model instead of the TypeSafe API. With Ollama
// 0.35+, the request is proxied to Ollama's native Jev-compatible
// /v1/systemone endpoint (real probability distributions and confidence).
// Older Ollama versions fall back to a chat adapter that asks the model
// for a JSON move choice and reshapes the reply into the Jev format.
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
// Optional: set OLLAMA_MODEL to serve /jev from a specific local Ollama
// model. When unset and no API key is configured, the server
// auto-detects the first installed model at startup.
let OLLAMA_MODEL = process.env.OLLAMA_MODEL || "";
// Whether Ollama's native /v1/systemone decision endpoint is available
// (Ollama 0.35+). Probed at startup; null means not probed yet — the
// first /jev request tries native and falls back on 404.
let nativeDecisions = null;
// Ollama software version (from GET /api/version), reported to the game
// via /jevstatus and shown in the HUD.
let ollamaVersion = "";
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const OLLAMA_URL = new URL(OLLAMA_HOST);
// Bind to loopback by default so the game and any injected API key are
// not exposed to the LAN. Set HOST=0.0.0.0 to serve the network.
const HOST = process.env.HOST || "127.0.0.1";
const MAX_BODY_BYTES = 64 * 1024;
const UPSTREAM_TIMEOUT_MS = 3000;

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
const STATIC_FILES = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/style.css", "style.css"],
  ["/game.js", "game.js"],
]);

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendUpstreamError(res, error, detail) {
  if (res.destroyed || res.writableEnded) return;
  if (res.headersSent) {
    res.destroy();
    return;
  }
  sendJson(res, 502, { error, detail });
}

function bindUpstream(res, upstream) {
  const abort = () => {
    if (!res.writableEnded) upstream.destroy();
  };
  const timeout = setTimeout(() => {
    upstream.destroy(new Error("upstream timed out after 3 seconds"));
  }, UPSTREAM_TIMEOUT_MS);
  res.once("close", abort);
  upstream.once("close", () => {
    clearTimeout(timeout);
    res.off("close", abort);
  });
}

function readBody(req, res, onBody) {
  const chunks = [];
  let size = 0;
  let done = false;
  req.on("data", (chunk) => {
    if (done) return;
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      done = true;
      chunks.length = 0;
      sendJson(res, 413, { error: "payload_too_large", detail: "request body exceeds 64 KiB" });
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => {
    if (!done) onBody(Buffer.concat(chunks));
  });
  req.on("error", (e) => {
    if (done) return;
    done = true;
    sendJson(res, 400, { error: "bad_request", detail: String(e.message) });
  });
}

function hasAllowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (!req.headers.host) return false;
  try {
    return new URL(origin).origin === new URL("http://" + req.headers.host).origin;
  } catch (e) {
    return false;
  }
}

function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch (e) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("400 Bad Request");
    return;
  }
  const relative = STATIC_FILES.get(pathname);
  if (!relative) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 Not Found");
    return;
  }
  const file = path.join(ROOT, relative);
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": data.length,
      "X-Content-Type-Options": "nosniff",
    });
    res.end(req.method === "HEAD" ? undefined : data);
  });
}

function proxyJev(req, res) {
  readBody(req, res, (body) => {
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
    bindUpstream(res, upstream);
    upstream.on("error", (e) => {
      sendUpstreamError(res, "proxy_error", String(e.message));
    });
    upstream.end(body);
  });
}

// POST a JSON body to a path on the Ollama API, honoring the
// OLLAMA_HOST protocol (http or https) and its implied default port.
function ollamaPost(path, body, onReply) {
  const isTLS = OLLAMA_URL.protocol === "https:";
  const lib = isTLS ? https : http;
  const req = lib.request(
    {
      host: OLLAMA_URL.hostname,
      port: OLLAMA_URL.port || (isTLS ? 443 : 11434),
      path: path,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    },
    onReply
  );
  req.on("error", () => {});
  req.end(body);
  return req;
}

// GET a path from the Ollama API (same host/protocol selection).
function ollamaGet(path, onReply) {
  const isTLS = OLLAMA_URL.protocol === "https:";
  const lib = isTLS ? https : http;
  const req = lib.request(
    {
      host: OLLAMA_URL.hostname,
      port: OLLAMA_URL.port || (isTLS ? 443 : 11434),
      path: path,
      method: "GET",
    },
    onReply
  );
  req.on("error", () => {});
  req.end();
  return req;
}

// Fetch the Ollama software version so the HUD can display exactly
// what is running.
function fetchOllamaVersion() {
  ollamaGet("/api/version", (up) => {
    const parts = [];
    up.on("data", (d) => parts.push(d));
    up.on("end", () => {
      if (up.statusCode !== 200) return;
      try {
        const v = JSON.parse(Buffer.concat(parts).toString("utf8")).version;
        if (v) { ollamaVersion = v; console.log("Ollama version: " + v); }
      } catch (e) {}
    });
  });
}

// With no explicit model and no API key, use the first installed Ollama
// model so `node server.js` works out of the box on any machine with
// Ollama installed.
function autoDetectOllama() {
  ollamaGet("/api/tags", (up) => {
    const parts = [];
    up.on("data", (d) => parts.push(d));
    up.on("end", () => {
      if (up.statusCode !== 200) return;
      let data;
      try {
        data = JSON.parse(Buffer.concat(parts).toString("utf8"));
      } catch (e) {
        return;
      }
      const first = data.models && data.models[0] && data.models[0].name;
      if (first) {
        OLLAMA_MODEL = first;
        console.log("AI backend: no API key set, using local Ollama model " + OLLAMA_MODEL + " at " + OLLAMA_HOST);
        fetchOllamaVersion();
        warmOllama();
      }
    });
  });
}

// Handle POST /jev via Ollama. Reads the body once, then dispatches:
// proxy the Jev request to Ollama's native /v1/systemone endpoint
// (Ollama 0.35+), or adapt it through a chat completion on older
// versions. The first request probes which mode works.
function handleJevOllama(req, res) {
  readBody(req, res, (rawBody) => {
    let jevReq;
    try {
      jevReq = JSON.parse(rawBody.toString("utf8"));
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "bad_request", detail: "invalid JSON" }));
      return;
    }
    if (nativeDecisions === false) return chatAdapted(jevReq, res);
    // Native path: the game's request is already the Jev System One
    // shape — just point it at Ollama with the configured model.
    jevReq.model = OLLAMA_MODEL;
    const body = JSON.stringify(jevReq);
    const upstream = ollamaPost("/v1/systemone", body, (up) => {
      if (up.statusCode === 404) {
        // Ollama < 0.35 has no decision endpoint.
        nativeDecisions = false;
        up.resume();
        return chatAdapted(jevReq, res);
      }
      res.writeHead(up.statusCode || 502, {
        "Content-Type": up.headers["content-type"] || "application/json",
      });
      up.pipe(res);
    });
    bindUpstream(res, upstream);
    upstream.on("error", (e) => {
      sendUpstreamError(res, "ollama_error", String(e.message));
    });
  });
}

// Fallback for Ollama < 0.35: turn the Jev request into a chat prompt
// with a JSON-schema-constrained answer and reshape the reply into the
// Jev response shape the game expects. Probabilities are synthesized
// (peaked on the chosen move) because a chat model has no distribution.
function chatAdapted(jevReq, res) {
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
    const upstream = ollamaPost("/api/chat", body, (up) => {
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
    bindUpstream(res, upstream);
    upstream.on("error", (e) => {
      sendUpstreamError(res, "ollama_error", String(e.message));
    });
}

// At startup, fire one tiny decision request at Ollama's native
// /v1/systemone endpoint. This loads the model into memory before the
// first game poll (a cold load can take tens of seconds) and records
// whether the native decision endpoint is available. On Ollama < 0.35
// it 404s and the chat adapter takes over; warm that path instead.
function warmOllama() {
  const probeBody = JSON.stringify({
    model: OLLAMA_MODEL,
    state: "warm-up",
    questions: { q: { type: "choice", instructions: "Pick one.", criteria: { a: null, b: null } } },
  });
  ollamaPost("/v1/systemone", probeBody, (up) => {
    if (up.statusCode === 200) {
      nativeDecisions = true;
      console.log("Decision mode: native /v1/systemone (Ollama 0.35+)");
    } else {
      nativeDecisions = false;
      console.log("Decision mode: chat adapter (no native /v1/systemone)");
    }
    up.resume();
    if (nativeDecisions === false) {
      const body = JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        think: false,
        messages: [{ role: "user", content: "OK" }],
        options: { num_predict: 1 },
      });
      ollamaPost("/api/chat", body, (up2) => { up2.resume(); });
    }
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/jev") {
    if (!hasAllowedOrigin(req)) {
      sendJson(res, 403, { error: "forbidden_origin", detail: "POST /jev requires the same origin" });
      return;
    }
    if (OLLAMA_MODEL) return handleJevOllama(req, res);
    return proxyJev(req, res);
  }
  if (req.method === "GET" && req.url === "/jevstatus") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      serverKey: !!ENV_KEY || !!OLLAMA_MODEL,
      backend: OLLAMA_MODEL ? "ollama:" + OLLAMA_MODEL : "typesafe",
      mode: OLLAMA_MODEL ? (nativeDecisions === false ? "chat" : "native") : "typesafe",
      version: ollamaVersion,
    }));
    return;
  }
  if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res);
  res.writeHead(405, { "Content-Type": "text/plain", "Allow": "GET, HEAD, POST" });
  res.end("405 Method Not Allowed");
});
server.requestTimeout = 10000;
server.headersTimeout = 5000;

server.listen(PORT, HOST, () => {
  console.log("The Way of the Exploding Fight");
  console.log("Open http://" + HOST + ":" + PORT);
  if (OLLAMA_MODEL) {
    console.log("AI backend: Ollama model " + OLLAMA_MODEL + " at " + OLLAMA_HOST);
    fetchOllamaVersion();
    warmOllama();
  } else if (ENV_KEY) {
    console.log("Jev proxy: POST /jev -> https://" + TS_HOST + TS_PATH);
  } else {
    console.log("No API key set; looking for a local Ollama instance...");
    autoDetectOllama();
  }
});
