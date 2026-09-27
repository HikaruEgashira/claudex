#!/usr/bin/env node
// claudexd — loopback Anthropic-wire proxy with per-model provider routing.
// Zero dependencies. A forwarder, not a protocol translator.
//
// Endpoints (Claude Code speaks these through ANTHROPIC_BASE_URL):
//   POST /v1/messages               streaming chat, routed by body.model
//   POST /v1/messages/count_tokens  token count, routed by body.model
//   GET  /v1/models                 catalog of routed models (model picker)
//   GET  /healthz                   liveness (claudex polls this for readiness)
//
// Config (config.json):
//   {
//     "port": 17865,
//     "defaultProvider": "zai",
//     "providers": {
//       "zai": { "baseUrl": "https://api.z.ai/api/anthropic",
//                "authToken": "${ZAI_AUTH_TOKEN}", "auth": "x-api-key" }
//     },
//     "routes":  { "glm-5.3": "zai", "glm-5.3-flash": "zai" },
//     "defaults": { "opus": "glm-5.3", "sonnet": "glm-5.3-flash", "haiku": "glm-5.3-flash" }
//   }
// Secrets: authToken may contain ${VAR} refs resolved from the daemon's own env
// (claudex starts it under `dotenvx run`, so plaintext keys never reach claude).
//
// --self-test: spins up fake upstreams and asserts routing + SSE passthrough +
// the model catalog. Exits 0/1; wired into CI.

import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

const MARKER = "claudex";
const CONFIG_DIR = process.env.CLAUDEX_CONFIG_DIR ?? path.join(os.homedir(), ".config", "claudex");
const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "transfer-encoding", "proxy-authenticate",
  "proxy-authorization", "te", "trailer", "upgrade", "host",
]);
const STRIP_REQ = new Set(["host", "content-length", "connection", "x-api-key", "authorization"]);

function die(msg) {
  console.error(`claudexd: ${msg}`);
  process.exit(1);
}

function expand(s) {
  return s.replace(/\$\{([A-Z0-9_]+)\}/g, (_, k) => process.env[k] ?? "");
}

function loadConfig(file) {
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    die(`cannot read config ${file}: ${e.message}`);
  }
  const names = Object.keys(cfg.providers ?? {});
  if (names.length === 0) die("config.json: providers object must have at least one entry");
  const providers = {};
  for (const name of names) {
    const p = cfg.providers[name];
    const token = expand(p.authToken ?? "");
    if (!token) die(`providers.${name}: authToken missing or ${p.authToken} env ref unresolved`);
    providers[name] = {
      baseUrl: String(p.baseUrl).replace(/\/+$/, ""),
      authToken: token,
      auth: p.auth || "x-api-key",
    };
  }
  return {
    port: cfg.port ?? 17865,
    defaultProvider: cfg.defaultProvider ?? names[0],
    providers,
    routes: cfg.routes ?? {},
    defaults: cfg.defaults ?? {},
  };
}

function resolveProvider(cfg, model) {
  return cfg.routes[model] && cfg.providers[cfg.routes[model]] ? cfg.routes[model] : cfg.defaultProvider;
}

function okJson(res, obj) {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

function modelsResponse(res, cfg) {
  const data = Object.keys(cfg.routes).map((id) => ({ id, type: "model", display_name: id }));
  okJson(res, { data, object: "list", has_more: false });
}

// Collect the request body, read the model field, then stream the upstream
// response back verbatim (SSE frames pass through untouched).
function proxyJson(req, res, cfg) {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("error", () => res.destroy());
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    let model;
    try {
      model = JSON.parse(body.toString("utf8")).model;
    } catch {
      model = undefined;
    }
    const provider = cfg.providers[resolveProvider(cfg, model)];
    if (!provider) return die(`no provider configured (defaultProvider: ${cfg.defaultProvider})`);
    forward(provider, req, res, body);
  });
}

function forward(provider, req, res, body) {
  const target = new URL(provider.baseUrl + req.url.split("?")[0]);
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!STRIP_REQ.has(k)) headers[k] = v;
  }
  headers[provider.auth || "x-api-key"] = provider.authToken;
  headers["content-length"] = body.length;

  const mod = target.protocol === "https:" ? https : http;
  const up = mod.request(target, { method: req.method, headers }, (ures) => {
    const out = {};
    for (const [k, v] of Object.entries(ures.headers)) {
      if (!HOP_BY_HOP.has(k)) out[k] = v;
    }
    res.writeHead(ures.statusCode ?? 502, out);
    ures.pipe(res);
    ures.on("error", () => res.destroy());
  });
  up.on("error", (e) => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({
      type: "error",
      error: { type: "proxy_error", message: `claudexd: upstream ${provider.baseUrl} failed: ${e.message}` },
    }));
  });
  up.end(body);
}

function createServer(cfg) {
  return http.createServer((req, res) => {
    const p = req.url.split("?")[0];
    if (req.method === "GET" && p === "/healthz") return okJson(res, { ok: true, marker: MARKER });
    if (req.method === "GET" && p === "/v1/models") return modelsResponse(res, cfg);
    if (req.method === "POST" && (p === "/v1/messages" || p === "/v1/messages/count_tokens"))
      return proxyJson(req, res, cfg);
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({
      type: "error",
      error: { type: "not_found_error", message: `claudexd: ${req.method} ${p} is not proxied` },
    }));
  });
}

// ---------------------------------------------------------------------------
// Self-test: fake upstreams A/B, assert per-model routing, auth replacement,
// SSE passthrough, model catalog, and the default-provider fallback.
// ---------------------------------------------------------------------------
function fakeUpstream(providerName, token) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let model = null;
      try {
        model = JSON.parse(body).model;
      } catch {}
      seen.push({ provider: providerName, auth: req.headers["x-api-key"], model, path: req.url });
      if (req.url.startsWith("/v1/messages/count_tokens")) {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ input_tokens: 5, output_tokens: 1 }));
      }
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write('event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","model":"x","role":"assistant"}}\n\n');
      res.write('event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok "}}\n\n');
      res.write('event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n');
      res.end('event: message_stop\ndata: {"type":"message_stop"}\n\n');
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, seen, port: server.address().port }));
  });
}

function selfTest() {
  const results = [];
  const run = async () => {
    const a = await fakeUpstream("a", "tok-a");
    const b = await fakeUpstream("b", "tok-b");
    const cfg = {
      port: 0,
      defaultProvider: "a",
      providers: {
        a: { baseUrl: `http://127.0.0.1:${a.port}`, authToken: "tok-a" },
        b: { baseUrl: `http://127.0.0.1:${b.port}`, authToken: "tok-b" },
      },
      routes: { "sonnet-x": "a", "haiku-x": "b" },
      defaults: {},
    };
    const proxy = await new Promise((resolve) => {
      const s = createServer(cfg);
      s.listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = `http://127.0.0.1:${proxy.address().port}`;

    const post = (p, model) =>
      fetch(`${base}${p}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": "client-stub" },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }] }),
      });

    const r1 = await post("/v1/messages", "sonnet-x");
    results.push(["sse body relays", (await r1.text()).includes("message_stop")]);
    results.push(["sse content-type kept", r1.headers.get("content-type") === "text/event-stream"]);

    await post("/v1/messages", "haiku-x");
    await post("/v1/messages", "unknown-model"); // falls back to defaultProvider a
    await post("/v1/messages/count_tokens", "haiku-x");

    const routeChecks = [
      ["sonnet-x routed to a with tok-a", a.seen.some((s) => s.model === "sonnet-x" && s.auth === "tok-a")],
      ["unknown model falls back to default provider a", a.seen.some((s) => s.model === "unknown-model" && s.auth === "tok-a")],
      ["haiku-x routed to b with tok-b", b.seen.some((s) => s.model === "haiku-x" && s.auth === "tok-b")],
      ["client auth never leaks upstream", !b.seen.some((s) => s.auth === "client-stub" || s.auth === undefined)],
      ["count_tokens routed by model", b.seen.some((s) => s.path === "/v1/messages/count_tokens")],
    ];
    for (const [name, ok] of routeChecks) results.push([name, ok]);

    const models = await (await fetch(`${base}/v1/models`)).json();
    results.push(["model catalog lists routed ids", ["sonnet-x", "haiku-x"].every((m) => models.data.some((d) => d.id === m))]);

    let pass = 0;
    for (const [name, ok] of results) {
      console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
      if (ok) pass++;
    }
    console.log(`\n${pass}/${results.length} checks passed`);
    proxy.close();
    a.server.close();
    b.server.close();
    process.exit(pass === results.length ? 0 : 1);
  };
  run().catch((e) => {
    console.error(`FAIL  ${e.message}`);
    process.exit(1);
  });
}

// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
if (args.includes("--self-test")) selfTest();
else if (args.includes("--help") || args.includes("-h")) {
  console.log(`claudexd — Anthropic-wire routing proxy

Usage:
  claudexd [--config <file>] [--pidfile <file>]
  claudexd --self-test
  claudexd --help

Env:
  CLAUDEX_CONFIG_DIR   config dir (default ~/.config/claudex)`);
} else {
  const configFile = argValue(args, "--config") ?? path.join(CONFIG_DIR, "config.json");
  const pidFile = argValue(args, "--pidfile") ?? path.join(CONFIG_DIR, "daemon.pid");
  const cfg = loadConfig(configFile);
  const server = createServer(cfg);
  server.on("error", (e) => {
    if (e.code === "EADDRINUSE") {
      // Existing listener on our port may be us (idempotent restart/reuse).
      fetch(`http://127.0.0.1:${cfg.port}/healthz`, { signal: AbortSignal.timeout(2000) })
        .then((r) => r.json())
        .then((j) => {
          if (j.ok && j.marker === MARKER) {
            console.log(`claudexd: already running on :${cfg.port}`);
            process.exit(0);
          }
        })
        .catch(() => die(`port ${cfg.port} is in use by another process`));
    } else {
      die(`listen failed: ${e.message}`);
    }
  });
  server.listen(cfg.port, "127.0.0.1", () => {
    writeFileSync(pidFile, String(process.pid));
    console.log(`claudexd: listening on http://127.0.0.1:${cfg.port} (pid ${process.pid})`);
  });
  const shutdown = () => {
    server.close();
    try {
      unlinkSync(pidFile);
    } catch {}
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

function argValue(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}