const states = require("./states.json");
const districts = require("./districts.json");
const mukims = require("./mukims.json");

// ---------------------------------------------------------------------------
// Everything is loaded once and indexed in memory (~2,100 records total).
// No database, no queries built from user input — lookups are Map reads and
// linear scans over trusted, static data, so there is nothing to inject into.
// ---------------------------------------------------------------------------

const stateById = new Map();
const stateByName = new Map();
const districtById = new Map();
const districtsByName = new Map(); // name -> [districts] (guards against ambiguity)
const districtsByStateId = new Map();
const mukimsByDistrictId = new Map();

for (const state of states) {
  stateById.set(state.id, state);
  stateByName.set(normalize(state.name), state);
  districtsByStateId.set(state.id, []);
}

for (const district of districts) {
  districtById.set(district.id, district);
  districtsByStateId.get(district.state_id).push(district);
  mukimsByDistrictId.set(district.id, []);

  const key = normalize(district.name);
  if (!districtsByName.has(key)) districtsByName.set(key, []);
  districtsByName.get(key).push(district);
}

for (const mukim of mukims) {
  mukimsByDistrictId.get(mukim.district_id).push(mukim);
}

function normalize(text) {
  return String(text).trim().toLowerCase();
}

/** Resolve a state by numeric ID or name (case-insensitive). */
function findState(idOrName) {
  const asNumber = Number(idOrName);
  if (Number.isInteger(asNumber)) return stateById.get(asNumber) || null;
  return stateByName.get(normalize(idOrName)) || null;
}

/**
 * Resolve a district by numeric ID or name.
 * Returns { district } on success, { ambiguous: [...] } when several
 * districts share the name, or {} when nothing matches.
 */
function findDistrict(idOrName) {
  const asNumber = Number(idOrName);
  if (Number.isInteger(asNumber)) {
    const district = districtById.get(asNumber);
    return district ? { district } : {};
  }
  const matches = districtsByName.get(normalize(idOrName)) || [];
  if (matches.length === 1) return { district: matches[0] };
  if (matches.length > 1) return { ambiguous: matches.map(withStateName) };
  return {};
}

function districtsOfState(state) {
  return districtsByStateId.get(state.id).map(withStateName);
}

function mukimsOfDistrict(district, type) {
  let list = mukimsByDistrictId.get(district.id);
  if (type) list = list.filter((m) => m.type === type);
  return list.map((m) => withPlaceNames(m));
}

function withStateName(district) {
  return { ...district, state: stateById.get(district.state_id).name };
}

function withPlaceNames(mukim) {
  return {
    ...mukim,
    district: districtById.get(mukim.district_id).name,
    state: stateById.get(mukim.state_id).name,
  };
}

/**
 * Case-insensitive substring search across states, districts, and mukims.
 * Uses String.includes only — no regex is ever built from user input,
 * so there is no ReDoS surface. Result sets are capped by the caller.
 */
function search(query, type, limit) {
  const q = normalize(query);
  const results = { states: [], districts: [], mukims: [] };

  if (!type || type === "states") {
    results.states = states
      .filter((s) => normalize(s.name).includes(q) || normalize(s.capital).includes(q))
      .slice(0, limit);
  }
  if (!type || type === "districts") {
    results.districts = districts
      .filter(
        (d) =>
          normalize(d.name).includes(q) ||
          (d.alt_name && normalize(d.alt_name).includes(q)) ||
          (d.division && normalize(d.division).includes(q))
      )
      .slice(0, limit)
      .map(withStateName);
  }
  if (!type || type === "mukims") {
    results.mukims = mukims
      .filter((m) => normalize(m.name).includes(q))
      .slice(0, limit)
      .map((m) => withPlaceNames(m));
  }
  return results;
}

module.exports = {
  states,
  districts,
  mukims,
  findState,
  findDistrict,
  districtsOfState,
  mukimsOfDistrict,
  withStateName,
  withPlaceNames,
  search,
};
