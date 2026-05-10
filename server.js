const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function pathnameOf(req) {
  try {
    return new URL(req.url || "/", "http://localhost").pathname;
  } catch {
    return "/";
  }
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = path.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  const abs = path.join(ROOT, normalized);
  if (!abs.startsWith(ROOT)) return null;
  return abs;
}

function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function forwardWebhook(fullName) {
  const url = process.env.NAME_WEBHOOK_URL;
  if (!url) return;
  const body = url.includes("discord.com/api/webhooks")
    ? JSON.stringify({ content: `**Studentify VIP** — Nume: ${fullName}` })
    : JSON.stringify({ fullName, receivedAt: new Date().toISOString(), source: "13mai" });
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!r.ok) console.error("[guest-name] webhook HTTP", r.status);
  } catch (e) {
    console.error("[guest-name] webhook err", e.message);
  }
}

const server = http.createServer(async (req, res) => {
  const p = pathnameOf(req);

  if (req.method === "OPTIONS" && p.startsWith("/api/")) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (req.method === "POST" && p === "/api/guest-name") {
    try {
      const raw = await readBody(req);
      let data;
      try {
        data = JSON.parse(raw || "{}");
      } catch {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "invalid json" }));
        return;
      }
      const fullName = typeof data.fullName === "string" ? data.fullName.trim().slice(0, 200) : "";
      if (!fullName) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "fullName required" }));
        return;
      }
      const stamp = new Date().toISOString();
      console.log(`[guest-name] ${stamp} — ${fullName}`);
      forwardWebhook(fullName).catch(() => {});
      res.writeHead(204);
      res.end();
    } catch (e) {
      if (e.message === "too large") {
        res.writeHead(413);
        res.end();
        return;
      }
      res.writeHead(500);
      res.end();
    }
    return;
  }

  const target = p === "/" ? "/index.html" : p;
  const abs = safePath(target);

  if (!abs) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(abs, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(abs);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Listening on http://0.0.0.0:${PORT}`);
});
