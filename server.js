// GKEDIT AI: one Node service that serves the website AND proxies the AI.
// Env: ANTHROPIC_API_KEY (required), ACCESS_CODE (optional, makes site private),
//      ANTHROPIC_MODEL, RATE_PER_MIN, RATE_PER_DAY, GLOBAL_PER_DAY, PORT
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const PORT = process.env.PORT || 8787;
const CODE = process.env.ACCESS_CODE || "";
const PER_MIN = +process.env.RATE_PER_MIN || 12;
const PER_DAY = +process.env.RATE_PER_DAY || 150;
const GLOBAL_DAY = +process.env.GLOBAL_PER_DAY || 2000;
if (!KEY) { console.error("Set ANTHROPIC_API_KEY"); process.exit(1); }

const LANGS = new Set(["en-IN", "te-IN", "hi-IN", "ta-IN", "kn-IN"]);
const TOOLS = [
  { name: "open_link", description: "Prepare a link the user can tap to open. kinds: youtube (search), maps_search, maps_directions (query=destination), google, whatsapp (query=phone digits with country code, text=message draft), call (query=phone number), email (query=address, text=body), sms (query=number, text=body). The user taps to confirm; nothing is sent automatically.",
    input_schema: { type: "object", properties: { kind: { type: "string" }, query: { type: "string" }, text: { type: "string" } }, required: ["kind", "query"] } },
  { name: "add_task", description: "Add a to-do or reminder to the Tasks page.", input_schema: { type: "object", properties: { text: { type: "string" }, due: { type: "string" } }, required: ["text"] } },
  { name: "add_note", description: "Save a note.", input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
  { name: "set_timer", description: "Start a countdown timer (the page must stay open).", input_schema: { type: "object", properties: { seconds: { type: "number" }, label: { type: "string" } }, required: ["seconds"] } },
  { name: "get_time", description: "Current local date and time of the user.", input_schema: { type: "object", properties: {} } },
];

const hits = new Map(); let globalCount = 0, dayKey = new Date().toDateString();
function limited(ip) {
  const now = Date.now(), d = new Date().toDateString();
  if (d !== dayKey) { dayKey = d; globalCount = 0; hits.clear(); }
  if (globalCount >= GLOBAL_DAY) return true;
  const h = hits.get(ip) || { t: [], day: 0 };
  h.t = h.t.filter(x => now - x < 60000);
  if (h.t.length >= PER_MIN || h.day >= PER_DAY) { hits.set(ip, h); return true; }
  h.t.push(now); h.day++; globalCount++; hits.set(ip, h); return false;
}
const ok = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const send = (res, code, obj) => res.writeHead(code, { "content-type": "application/json" }).end(JSON.stringify(obj));
const HDR = { "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-frame-options": "SAMEORIGIN" };

http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];
  if (req.method === "GET" && (url === "/" || url === "/index.html")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...HDR }).end(fs.readFileSync(path.join(dir, "index.html"))); return;
  }
  if (req.method === "GET" && url === "/health") { res.writeHead(200).end("ok"); return; }
  if (req.method !== "POST" || url !== "/api/chat") { res.writeHead(404).end(); return; }

  if (CODE && !ok(String(req.headers["x-access-code"] || ""), CODE)) return send(res, 401, { error: "access code required" });
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress).split(",")[0].trim();
  if (limited(ip)) return send(res, 429, { error: "rate limit" });

  let raw = ""; for await (const c of req) { raw += c; if (raw.length > 100000) return send(res, 413, { error: "too large" }); }
  try {
    const b = JSON.parse(raw);
    if (!Array.isArray(b.messages) || !b.messages.length || b.messages.length > 41) return send(res, 400, { error: "bad messages" });
    if (!b.messages.every(m => (m.role === "user" || m.role === "assistant") && (typeof m.content === "string" || Array.isArray(m.content)))) return send(res, 400, { error: "bad messages" });
    const name = String(b.userName || "").replace(/[^\p{L}\p{N} .'-]/gu, "").slice(0, 40) || "friend";
    const lang = LANGS.has(b.lang) ? b.lang : "en-IN";
    const system = `You are GKEDIT AI, a warm, capable personal assistant. Address the user as "${name}". Reply in the language the user writes in (default locale ${lang}); Telugu and Hindi are fully supported. Keep replies clear and concise; you may use **bold**. Use tools for actions (links, tasks, notes, timers). For calls, messages and emails, always prepare a draft link and tell the user to review and tap to confirm. Never claim you sent something. Current time: ${new Date().toISOString()}.`;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, system, tools: TOOLS, messages: b.messages }),
    });
    const j = await r.json();
    if (!r.ok) { console.error("Anthropic error", r.status, JSON.stringify(j).slice(0, 300)); return send(res, 502, { error: "ai error" }); }
    send(res, 200, { content: j.content, stop_reason: j.stop_reason });
  } catch (e) { console.error(e); send(res, 400, { error: "bad request" }); }
}).listen(PORT, () => console.log("GKEDIT on :" + PORT));
