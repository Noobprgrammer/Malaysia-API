const express = require("express");
const db = require("../database/data");

const router = express.Router();

// ---------------------------------------------------------------------------
// Input validation
//
// Every route parameter passes through validateParam() before it is used.
// Parameters are capped in length and restricted to an allowlist of
// characters that can appear in Malaysian place names. Anything else —
// path traversal characters, angle brackets, null bytes, control characters,
// script fragments — is rejected with a 400 before any lookup happens.
//
// Note the data layer never builds queries or regexes from these values;
// validation here is defence in depth, not the only line.
// ---------------------------------------------------------------------------

const MAX_PARAM_LENGTH = 64;
const ALLOWED_CHARS = /^[a-zA-Z0-9 .,'()&/-]+$/;
const MUKIM_TYPES = new Set(["mukim", "bandar", "pekan"]);
const SEARCH_TYPES = new Set(["states", "districts", "mukims"]);
const SEARCH_RESULT_LIMIT = 100;

function validateParam(raw) {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length === 0 || value.length > MAX_PARAM_LENGTH) return null;
  if (!ALLOWED_CHARS.test(value)) return null;
  return value;
}

function ok(res, data) {
  const body = { status: "success" };
  if (Array.isArray(data)) body.count = data.length;
  body.data = data;
  return res.json(body);
}

function badRequest(res, message) {
  return res.status(400).json({ status: "error", message });
}

function notFound(res, message) {
  return res.status(404).json({ status: "error", message });
}

// Resolve and validate a :state param in one step.
function resolveState(req, res) {
  const value = validateParam(req.params.state);
  if (!value) {
    badRequest(res, "Invalid state parameter. Use a numeric ID (1-16) or a name like \"selangor\" (max 64 characters, letters, digits, and basic punctuation only).");
    return null;
  }
  const state = db.findState(value);
  if (!state) {
    notFound(res, `No state or federal territory matches "${value}". Use a numeric ID (1-16) or a name like "selangor".`);
    return null;
  }
  return state;
}

// ---------------------------------------------------------------------------
// GET /geo/v1/states — all 13 states and 3 federal territories
// ---------------------------------------------------------------------------
router.get("/states", (req, res) => {
  ok(res, db.states);
});

// ---------------------------------------------------------------------------
// GET /geo/v1/states/:state — one state with its districts
// ---------------------------------------------------------------------------
router.get("/states/:state", (req, res) => {
  const state = resolveState(req, res);
  if (!state) return;
  ok(res, { ...state, districts: db.districtsOfState(state) });
});

// ---------------------------------------------------------------------------
// GET /geo/v1/districts — all districts nationwide
// ---------------------------------------------------------------------------
router.get("/districts", (req, res) => {
  ok(res, db.districts.map((d) => db.withStateName(d)));
});

// ---------------------------------------------------------------------------
// GET /geo/v1/districts/:state — districts of one state
// ---------------------------------------------------------------------------
router.get("/districts/:state", (req, res) => {
  const state = resolveState(req, res);
  if (!state) return;
  ok(res, db.districtsOfState(state));
});

// ---------------------------------------------------------------------------
// GET /geo/v1/mukims — all mukims, bandar, and pekan (filter with ?type=)
// ---------------------------------------------------------------------------
router.get("/mukims", (req, res) => {
  const type = req.query.type;
  if (type !== undefined && !MUKIM_TYPES.has(type)) {
    return badRequest(res, 'Invalid type. Use "mukim", "bandar", or "pekan", or omit it for all.');
  }
  let list = db.mukims;
  if (type) list = list.filter((m) => m.type === type);
  ok(res, list.map((m) => db.withPlaceNames(m)));
});

// ---------------------------------------------------------------------------
// GET /geo/v1/mukims/:district — mukims of one district (by ID or name)
// ---------------------------------------------------------------------------
router.get("/mukims/:district", (req, res) => {
  const value = validateParam(req.params.district);
  if (!value) {
    return badRequest(res, "Invalid district parameter. Use a numeric district ID or a district name (max 64 characters).");
  }

  const type = req.query.type;
  if (type !== undefined && !MUKIM_TYPES.has(type)) {
    return badRequest(res, 'Invalid type. Use "mukim", "bandar", or "pekan", or omit it for all.');
  }

  const result = db.findDistrict(value);
  if (result.ambiguous) {
    return res.status(400).json({
      status: "error",
      message: `"${value}" matches more than one district. Use the district ID instead.`,
      matches: result.ambiguous,
    });
  }
  if (!result.district) {
    return notFound(res, `No district matches "${value}". List districts via /geo/v1/districts, then use the district's ID or name.`);
  }
  ok(res, db.mukimsOfDistrict(result.district, type));
});

// ---------------------------------------------------------------------------
// GET /geo/v1/search/:query?type=states|districts|mukims
// ---------------------------------------------------------------------------
router.get("/search/:query", (req, res) => {
  const query = validateParam(req.params.query);
  if (!query) {
    return badRequest(res, "Invalid search query. Use 2-64 characters: letters, digits, and basic punctuation only.");
  }
  if (query.length < 2) {
    return badRequest(res, "Search query must be at least 2 characters long.");
  }

  const type = req.query.type;
  if (type !== undefined && !SEARCH_TYPES.has(type)) {
    return badRequest(res, 'Invalid type. Use "states", "districts", or "mukims", or omit it to search all.');
  }

  const results = db.search(query, type, SEARCH_RESULT_LIMIT);
  const count = results.states.length + results.districts.length + results.mukims.length;
  res.json({ status: "success", query, count, data: results });
});

module.exports = router;
