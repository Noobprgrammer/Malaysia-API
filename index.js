const path = require("path");
const express = require("express");
const cors = require("cors");

const geoV1 = require("./src/routes/geo-v1");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Baseline hardening
// ---------------------------------------------------------------------------

app.disable("x-powered-by");

// Trust exactly one reverse proxy (Vercel / Render / nginx). This makes
// req.ip come from the proxy-set header while ignoring anything the client
// appends, so attackers can't spoof X-Forwarded-For to dodge rate limits.
app.set("trust proxy", 1);

// Use the simple query parser: no nested objects or arrays from query
// strings, which removes the deep-object / prototype-pollution style abuse
// that the extended "qs" parser can enable.
app.set("query parser", "simple");

// This API is read-only. No body parser is mounted at all, so request
// bodies are never interpreted — JSON body attacks have nothing to hit.

// Security headers on every response.
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    // CSP: the explorer UI uses same-origin scripts only (no inline JS),
    // Google Fonts for styles/fonts, and same-origin fetches.
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'none'",
    ].join("; "),
  });
  next();
});

// Method and URL guards, before any routing work happens.
app.use((req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return res.status(405).set("Allow", "GET, HEAD, OPTIONS").json({
      status: "error",
      message: "This is a read-only API. Only GET requests are supported.",
    });
  }
  if (req.originalUrl.length > 300) {
    return res.status(414).json({ status: "error", message: "URL too long." });
  }
  next();
});

app.use(cors({ methods: ["GET", "HEAD", "OPTIONS"] }));

// ---------------------------------------------------------------------------
// Rate limiting (fixed window, per IP, bounded memory)
//
// The tracking Map is capped: if an attacker rotates through thousands of
// source addresses, the oldest window entries are evicted instead of letting
// the Map grow without bound (which would itself be a memory-exhaustion DoS).
//
// Honest note, also in SECURITY.md: application-level limiting protects
// against abusive clients and scrapers. Volumetric DDoS (multi-Gbps floods)
// must be absorbed before it reaches Node — deploy behind Vercel, Cloudflare,
// or a similar edge, which all provide that layer.
// ---------------------------------------------------------------------------

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 120;
const MAX_TRACKED_IPS = 10000;
const hits = new Map();

app.use((req, res, next) => {
  const now = Date.now();
  const ip = req.ip || "unknown";
  const entry = hits.get(ip);

  if (!entry || now - entry.start > WINDOW_MS) {
    if (hits.size >= MAX_TRACKED_IPS) {
      // Evict the oldest entry (Map preserves insertion order).
      hits.delete(hits.keys().next().value);
    }
    hits.delete(ip); // re-insert so it moves to the newest position
    hits.set(ip, { start: now, count: 1 });
    return next();
  }

  entry.count += 1;
  if (entry.count > MAX_REQUESTS) {
    res.set("Retry-After", Math.ceil((entry.start + WINDOW_MS - now) / 1000));
    return res.status(429).json({
      status: "error",
      message: "Too many requests. Limit is 120 requests per minute.",
    });
  }
  next();
});

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of hits) {
    if (now - entry.start > WINDOW_MS) hits.delete(ip);
  }
}, WINDOW_MS).unref();

// ---------------------------------------------------------------------------
// Response cache (bounded LRU)
//
// Only successful (200) responses are cached, and the cache is capped so a
// flood of unique-but-valid URLs (e.g. random search queries) can't grow it
// without limit. Everything cacheable is also marked cacheable for browsers
// and CDNs, which is the layer that actually blunts request floods.
// ---------------------------------------------------------------------------

const CACHE_MAX_ENTRIES = 500;
const responseCache = new Map();

app.use("/geo", (req, res, next) => {
  if (req.method !== "GET") return next();

  const key = req.originalUrl;
  const cached = responseCache.get(key);
  if (cached) {
    // Refresh recency for LRU behaviour.
    responseCache.delete(key);
    responseCache.set(key, cached);
    res.set("X-Cache", "HIT");
    res.set("Cache-Control", "public, max-age=86400");
    return res.status(200).json(cached);
  }

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode === 200) {
      if (responseCache.size >= CACHE_MAX_ENTRIES) {
        responseCache.delete(responseCache.keys().next().value);
      }
      responseCache.set(key, body);
    }
    res.set("X-Cache", "MISS");
    res.set("Cache-Control", "public, max-age=86400");
    return originalJson(body);
  };
  next();
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.use("/geo/v1", geoV1);

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime_seconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// API explorer UI. express.static resolves paths safely (no traversal),
// and dotfiles are ignored by default.
app.use(express.static(path.join(__dirname, "public"), { maxAge: "1h" }));

// JSON 404 — echoes nothing back from the request path, so there is no
// reflected-content surface here.
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "Route not found. See / for the API explorer or /geo/v1/states to get started.",
  });
});

// Central error handler: never leak stack traces or internals.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ status: "error", message: "Internal server error." });
});

const server = app.listen(PORT, () => {
  console.log(`MY APIs running on http://localhost:${PORT}`);
});

// Slowloris resistance: don't hold sockets open indefinitely.
server.headersTimeout = 10 * 1000;
server.requestTimeout = 15 * 1000;
server.keepAliveTimeout = 5 * 1000;

module.exports = app;
