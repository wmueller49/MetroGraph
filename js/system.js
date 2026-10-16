// Picks which city's system to show (?city=nyc, defaulting to D.C.) and
// normalizes its lines for the renderer and router.
(function () {

const SYSTEMS = window.MetroSystems;
const DEFAULT_SYSTEM = "dc";

const requested = new URLSearchParams(window.location.search).get("city");
const systemId = SYSTEMS[requested] ? requested : DEFAULT_SYSTEM;
const system = SYSTEMS[systemId];

// A line is one stop list or several `branches` (e.g. the A's Far Rockaway
// and Lefferts Blvd ends). In a stop list, ids prefixed "~" are stations the
// line runs through without stopping, as express trains do. Each branch keeps
// both: `path` (every station along the track, for drawing) and `stops`
// (where trains actually stop, for routing), plus `stopsHere[i]` saying
// whether trains stop at path[i].
const LINES = system.LINES.map((line) => ({
  ...line,
  branches: (line.branches || [line.stops]).map((seq) => ({
    path: seq.map((id) => id.replace(/^~/, "")),
    stops: seq.filter((id) => !id.startsWith("~")),
    stopsHere: seq.map((id) => !id.startsWith("~")),
  })),
}));

window.MetroData = {
  SYSTEMS: Object.entries(SYSTEMS).map(([id, s]) => ({ id, name: s.name })),
  systemId,
  name: system.name,
  defaultFrom: system.defaultFrom,
  defaultTo: system.defaultTo,
  TRACK_ORDER: system.trackOrder,
  STATIONS: system.STATIONS,
  LINES,
  // Pairs of stations in one complex but drawn apart, linked by a walk.
  TRANSFERS: system.TRANSFERS || [],
};

})();
