# MY APIs – Malaysia Geo Location API (v1)

Official Link: https://malaysia-api-one.vercel.app

A fast, open-source REST API for Malaysia's administrative geography: all **13 states**, **3 federal territories**, **159 administrative districts** (daerah / jajahan), and **1,944 sub-districts** — mukim, bandar, and pekan — from Perlis to Tawau.

No API key. No database. CORS enabled. Deploys to Vercel in one click, or runs anywhere Node.js runs.

Ideal for address forms, cascading state → district dropdowns, dashboards, delivery-zone tools, and anything location-based in Malaysia.

---

## 🚀 Features

- **Complete geo data:** 16 states & federal territories, 159 districts, and 1,944 mukims/bandar/pekan, with capitals, regions (Peninsular / East Malaysia), and ISO 3166-2 codes
- **Filter support:** districts by state, mukims by district — by ID or by name
- **Hardened by default:** strict input validation, security headers, CSP, bounded rate limiting and caching — see [SECURITY.md](SECURITY.md)
- **Search:** case-insensitive search across states, districts, and mukims, with optional type filter
- **Sarawak divisions included:** every Sarawak district carries its parent division (bahagian)
- **Developer friendly:** clean, consistent JSON envelope; open CORS
- **Fast by design:** the entire dataset lives in memory, with response caching and rate limiting built in
- **Live API explorer:** test every endpoint from your browser at `/`
- **Zero infrastructure:** no MongoDB, no Redis, no env vars — just `npm start`

---

## 📦 API Endpoints

All endpoints are prefixed with `/geo/v1`.

| Endpoint                        | Description                                                        |
| ------------------------------- | ------------------------------------------------------------------ |
| `GET /geo/v1/states`            | All 13 states and 3 federal territories                            |
| `GET /geo/v1/states/{id\|name}` | One state (by ID `1–16` or name), including all of its districts   |
| `GET /geo/v1/districts`         | All 159 districts nationwide                                       |
| `GET /geo/v1/districts/{id\|name}` | Districts of one state, e.g. `/districts/sabah` or `/districts/12` |
| `GET /geo/v1/mukims`            | All 1,944 sub-districts. Filter with `?type=mukim`, `?type=bandar`, or `?type=pekan` |
| `GET /geo/v1/mukims/{id\|name}` | Sub-districts of one district, e.g. `/mukims/klang` or `/mukims/76`  |
| `GET /geo/v1/search/{query}`    | Search states, districts, and mukims. Filter with `?type=states\|districts\|mukims` |
| `GET /health`                   | Service status and uptime                                          |

State IDs follow ISO 3166-2:MY ordering (`1` Johor … `13` Sarawak, `14` Kuala Lumpur, `15` Labuan, `16` Putrajaya).

---

## 📝 Example Usage

Get all districts in Selangor (by name or by ID — both work):

```
GET /geo/v1/districts/selangor
GET /geo/v1/districts/10
```

```json
{
  "status": "success",
  "count": 9,
  "data": [
    { "id": 73, "state_id": 10, "name": "Gombak", "state": "Selangor" },
    { "id": 74, "state_id": 10, "name": "Hulu Langat", "state": "Selangor" },
    ...
  ]
}
```

Get one state with its districts embedded:

```
GET /geo/v1/states/pahang
```

Get the mukims of Klang (towns and small towns included by default):

```
GET /geo/v1/mukims/klang
GET /geo/v1/mukims/76?type=mukim
```

```json
{
  "status": "success",
  "count": 9,
  "data": [
    { "id": 1467, "district_id": 76, "state_id": 10, "name": "Kapar", "type": "mukim", "district": "Klang", "state": "Selangor" },
    ...
  ]
}
```

Search for anything containing "kuala", districts only:

```
GET /geo/v1/search/kuala?type=districts
```

Cascading dropdowns in the browser:

```js
const { data: states } = await fetch("https://your-app.vercel.app/geo/v1/states")
  .then(r => r.json());

// when the user picks a state:
const { data: districts } = await fetch(`https://your-app.vercel.app/geo/v1/districts/${stateId}`)
  .then(r => r.json());
```

---

## 🗂️ Project Structure

```
my-apis/
├── public/                 # API explorer UI
│   ├── index.html
│   └── style.css
├── src/
│   ├── database/
│   │   ├── states.json     # 16 states & federal territories
│   │   ├── districts.json  # 159 districts
│   │   ├── mukims.json     # 1,944 mukims, bandar & pekan
│   │   └── data.js         # in-memory indexes, lookups, search
│   └── routes/
│       └── geo-v1.js       # v1 API routes
├── index.js                # Express entry point (CORS, cache, rate limit)
├── package.json
├── vercel.json             # Vercel deployment config
├── SECURITY.md             # Threat model & hardening notes
└── README.md
```

---

## 🏃 Run Locally

Requires Node.js 18+.

```bash
git clone <your-repo-url>
cd my-apis
npm install
npm start
```

Open <http://localhost:3000> for the API explorer, or hit the API directly:

```bash
curl http://localhost:3000/geo/v1/states
```

---

## ☁️ Deploy

**Vercel (recommended):** push this repo to GitHub, import it at [vercel.com](https://vercel.com), and deploy — `vercel.json` is already configured. Your API will be live at `https://<project>.vercel.app/geo/v1/states`.

Also works as-is on Railway, Render, Fly.io, or any Node host (`npm start`, port from `PORT`).

---

## ⚡ Performance

- The full dataset (~2,100 records) is loaded into memory at startup and indexed by ID and name — every request is served without touching a database.
- Successful responses are cached in memory and sent with `Cache-Control: public, max-age=86400`, so browsers and CDNs cache them too. The `X-Cache` header shows `HIT`/`MISS`.
- A built-in rate limiter allows **120 requests per minute per IP** to keep free-tier deployments healthy.

---

## 🔒 Security

Input is strictly validated (length caps + character allowlists on every parameter), no request bodies are ever parsed, no regex is built from user input, rate limiting and caching are memory-bounded, and every response carries hardened security headers. There is no database, so there is nothing to inject into. Full threat model in [SECURITY.md](SECURITY.md) — including the honest part: pair the app with a CDN/edge (Vercel and Cloudflare both work free) for real volumetric DDoS protection.

---

## 📚 Data Notes

- District names use their official Malay forms; Penang districts also carry an `alt_name` in English (e.g. Timur Laut / Northeast Penang Island).
- Sarawak districts include their parent `division` (bahagian).
- Lojing (Kelantan) is included and marked as a *jajahan kecil* (small district).
- Perlis has no district subdivisions, so it appears as a single administrative unit.
- Each federal territory (Kuala Lumpur, Labuan, Putrajaya) is a single unit.
- Sub-district data (`mukims.json`) is derived from Malaysian government SDDSA codes via the Apache-2.0-licensed [lomotech/jajahan](https://github.com/lomotech/jajahan) dataset, remapped to this project's district IDs. It carries a `type` field distinguishing gazetted **mukim** (1,222), **bandar** / town (323), and **pekan** / small town (399) entries.
- The SDDSA snapshot predates a few newly gazetted districts, so their mukims currently sit under the former parent district (e.g. Bagan Datuk's mukims appear under Hilir Perak). Corrections welcome via PR.
- Sarawak's sub-district entries reflect its own structure (Sarawak does not use the mukim system the way Peninsular states do).

Spotted an outdated boundary or a new gazetted district? Open a pull request — the data lives in two plain JSON files under `src/database/`.

---

## 🤝 Contributing

1. Fork the repo
2. Edit `src/database/states.json` or `src/database/districts.json` (or the code)
3. Run `npm start` and check your change in the explorer
4. Open a pull request with a source for any data change

---

## 📄 License

MIT — free for personal and commercial use.

Inspired by [bd-apis](https://github.com/SudipMHX/bd-apis) by Mahatab Hossen Sudip.
