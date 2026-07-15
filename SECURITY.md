# Security

This document explains what the API is protected against, how, and — just as
importantly — what an application can't protect itself against alone.

## Threat model

MY APIs is a public, read-only, unauthenticated JSON API backed entirely by
static in-memory data. There are no accounts, no sessions, no secrets, no
database, and no state that a request can change. That shrinks the attack
surface to two things: **malicious input** and **resource exhaustion**.

## Injection

There is nothing to inject *into* — and input is still strictly validated.

- **No database.** All data lives in three JSON files loaded at startup.
  Lookups are `Map` reads and array scans over trusted, static data. No SQL,
  no NoSQL, no query strings are ever assembled from user input, so SQL/NoSQL
  injection is structurally impossible, not just filtered.
- **Strict input validation (defence in depth).** Every route parameter is
  capped at 64 characters and must match an allowlist
  (`a-zA-Z0-9 .,'()&/-`) covering Malaysian place names. Null bytes, angle
  brackets, path separators, control characters, and script fragments are
  rejected with a `400` before any lookup runs. Query-string values
  (`?type=`) are checked against fixed allowlists.
- **No ReDoS.** No regular expression is ever built from user input. Search
  uses `String.includes` — linear time, no catastrophic backtracking.
- **No command or path injection.** The server never shells out, never
  touches the filesystem with user-supplied paths. Static files are served by
  `express.static`, which resolves paths safely and refuses traversal.
- **No prototype pollution.** No request body is ever parsed (no body parser
  is mounted — the API is GET-only and rejects other methods with `405`), and
  the query parser is set to `simple`, so query strings can't create nested
  objects.
- **No XSS in responses.** The API returns `application/json` only, with
  `X-Content-Type-Options: nosniff`. Error messages that echo input only do
  so after allowlist validation. The explorer UI escapes all API output
  before rendering and runs under a strict Content-Security-Policy
  (`script-src 'self'`, no inline scripts, `object-src 'none'`,
  `frame-ancestors 'none'`).

## Denial of service

Application-level mitigations, all bounded in memory themselves:

- **Rate limiting:** 120 requests/minute per IP, with `Retry-After` on `429`.
- **Spoof-resistant IPs:** `trust proxy` is pinned to exactly one hop, so
  clients can't forge `X-Forwarded-For` chains to dodge the limiter.
- **Bounded tracking:** the rate-limit table is capped at 10,000 IPs with
  oldest-first eviction, so rotating source addresses can't exhaust memory.
- **Bounded response cache:** LRU-capped at 500 entries, and only `200`
  responses are stored — a flood of unique search URLs can't inflate it.
- **CDN-friendly caching:** every successful response carries
  `Cache-Control: public, max-age=86400`, letting the edge absorb repeats.
- **Request guards:** URLs over 300 characters get `414`; non-GET methods
  get `405`; no request body is ever read.
- **Slowloris resistance:** header, request, and keep-alive timeouts are set
  (10s / 15s / 5s) so idle sockets are dropped.
- **Cheap requests by design:** the heaviest endpoint serializes ~2,000 small
  records from memory — there are no expensive code paths to target.


## Other hardening

- `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
  `Permissions-Policy` lockdown, `Strict-Transport-Security`, and COOP/CORP
  headers on every response.
- `x-powered-by` disabled; the central error handler returns a generic `500`
  and never leaks stack traces.
- CORS is intentionally open (`GET` only) — this is a public read-only API
  and that is the point. Nothing sensitive can leak because nothing sensitive
  exists.
- Two runtime dependencies (`express`, `cors`), both ubiquitous and easy to
  audit. Run `npm audit` before deploying and keep them patched.

## Reporting

Found something? Open a GitHub issue (or a private security advisory if the
repo has them enabled) with reproduction steps.
