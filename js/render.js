(function () {
const { STATIONS, LINES } = window.MetroData;

// Pixels per grid unit at zoom level 1.
const UNIT = 44;

const STATION_RADIUS = 4.5;
const INTERCHANGE_RADIUS = 7;
const LINE_WIDTH = 6;
const ROUTE_LINE_WIDTH = 9;
// Top-down train icon size (screen px at zoom 1): two cars, each this long/wide.
// Wider than the route stroke so the train stands out on top of it.
const TRAIN_CAR_LENGTH = 16;
const TRAIN_CAR_WIDTH = 13;
const TRAIN_CAR_COUNT = 3;
const TRAIN_BODY_COLOR = "#eef0f2";
const MARKER_RADIUS = 10;
// Screen-px gap between adjacent parallel tracks where lines share the same edge.
const PARALLEL_SPACING = 9;
// Screen-px radius of the rounded corner where a line changes direction.
const CORNER_RADIUS = 14;

const BG_COLOR = "#0b0d10";
const LABEL_FONT_SIZE = 11;
const LABEL_HEIGHT = 13;

// Map of stationId -> [lineId, ...] serving it, used for interchange styling & tooltips.
const STATION_LINES = (() => {
  const map = {};
  for (const id of Object.keys(STATIONS)) map[id] = [];
  for (const line of LINES) {
    for (const stopId of line.stops) {
      if (!map[stopId].includes(line.id)) map[stopId].push(line.id);
    }
  }
  return map;
})();

// Stations at the end of any line, labelled ahead of ordinary stops.
const TERMINI = new Set(LINES.flatMap((l) => [l.stops[0], l.stops[l.stops.length - 1]]));

// Stations where track actually branches or crosses (3+ neighboring stops),
// e.g. Metro Center or Rosslyn, as opposed to stops that merely sit on a
// stretch shared by several lines. These are labelled first of all.
const JUNCTIONS = (() => {
  const neighbors = {};
  for (const line of LINES) {
    line.stops.forEach((id, i) => {
      neighbors[id] = neighbors[id] || new Set();
      if (i > 0) neighbors[id].add(line.stops[i - 1]);
      if (i < line.stops.length - 1) neighbors[id].add(line.stops[i + 1]);
    });
  }
  return new Set(Object.keys(neighbors).filter((id) => neighbors[id].size >= 3));
})();

const COLOR_BY_LINE = Object.fromEntries(LINES.map((l) => [l.id, l.color]));
function lineColor(id) {
  return COLOR_BY_LINE[id];
}

// Left-to-right order (relative to the direction of travel) of lines sharing
// track. Chosen so each line peels off the trunk from the side it leaves
// toward, e.g. Blue sits on the south side of the Orange/Silver/Blue trunk
// because it turns south at Rosslyn, so branching lines never cross.
const TRACK_ORDER = ["orange", "silver", "blue", "yellow", "green", "red"];

// Map of "stationA|stationB" (sorted) -> { ids, from } for the lines sharing
// that edge: `ids` in TRACK_ORDER, and `from` the station the first line to
// claim the edge travels away from, which fixes which side is "left" so lines
// running the edge in opposite directions still agree on their slots.
// Built once from the full route list, independent of the legend's hidden-line
// toggle, so visible tracks don't shift position when another line is hidden.
const EDGE_LINE_IDS = (() => {
  const map = new Map();
  for (const line of LINES) {
    for (let i = 0; i < line.stops.length - 1; i++) {
      const a = line.stops[i];
      const b = line.stops[i + 1];
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (!map.has(key)) map.set(key, { ids: [], from: a });
      const edge = map.get(key);
      if (!edge.ids.includes(line.id)) edge.ids.push(line.id);
    }
  }
  for (const edge of map.values()) {
    edge.ids.sort((x, y) => TRACK_ORDER.indexOf(x) - TRACK_ORDER.indexOf(y));
  }
  return map;
})();

// Map of stationId -> how many slots out from the station center its widest
// bundle of parallel tracks reaches (0 for a single track), so labels can
// start clear of the whole bundle rather than just the center track.
const STATION_BUNDLE = (() => {
  const map = {};
  for (const id of Object.keys(STATIONS)) map[id] = 0;
  for (const [key, edge] of EDGE_LINE_IDS) {
    const reach = (edge.ids.length - 1) / 2;
    for (const id of key.split("|")) map[id] = Math.max(map[id], reach);
  }
  return map;
})();

// Screen-px vector nudging line `lineId` sideways off the a->b centerline so
// lines sharing the edge fan out into evenly spaced parallel tracks.
function edgeOffset(view, aId, bId, lineId) {
  const key = aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
  const edge = EDGE_LINE_IDS.get(key);
  if (!edge || edge.ids.length <= 1) return { x: 0, y: 0 };
  const slot = edge.ids.indexOf(lineId) - (edge.ids.length - 1) / 2;
  const [fromId, toId] = edge.from === aId ? [aId, bId] : [bId, aId];
  const a = STATIONS[fromId];
  const b = STATIONS[toId];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const mag = slot * PARALLEL_SPACING * Math.sqrt(view.scale);
  return { x: (-(b.y - a.y) / len) * mag, y: ((b.x - a.x) / len) * mag };
}

// Screen-space polyline for a sequence of stations where hop i (station i ->
// i+1) runs on lineIds[i], with each line shifted onto its parallel track.
// Where the track turns, the incoming and outgoing offset tracks are joined
// at their intersection (a miter) so parallel lines stay evenly spaced
// through the corner. Where a line's slot changes on straight track (another
// line joins or leaves), both offset points are kept, making a small jog
// hidden under the interchange's station marker.
// Returns { points, first, last }: first[i]/last[i] index the points that
// belong to station i (equal unless that station has a jog).
function trackPolyline(view, stationIds, lineIds) {
  const points = [];
  const first = [];
  const last = [];
  for (let i = 0; i < stationIds.length; i++) {
    const base = stationScreenPos(view, stationIds[i]);
    const inOff = i > 0 ? edgeOffset(view, stationIds[i - 1], stationIds[i], lineIds[i - 1]) : null;
    const outOff = i < stationIds.length - 1 ? edgeOffset(view, stationIds[i], stationIds[i + 1], lineIds[i]) : null;
    first.push(points.length);

    if (!inOff || !outOff) {
      const off = inOff || outOff;
      points.push({ x: base.x + off.x, y: base.y + off.y });
    } else {
      const dirIn = unitDir(stationIds[i - 1], stationIds[i]);
      const dirOut = unitDir(stationIds[i], stationIds[i + 1]);
      const cross = dirIn.x * dirOut.y - dirIn.y * dirOut.x;
      const p1 = { x: base.x + inOff.x, y: base.y + inOff.y };
      const p2 = { x: base.x + outOff.x, y: base.y + outOff.y };
      if (Math.abs(cross) < 1e-6) {
        points.push(p1);
        if (Math.hypot(p2.x - p1.x, p2.y - p1.y) > 0.5) points.push(p2);
      } else {
        const t = ((p2.x - p1.x) * dirOut.y - (p2.y - p1.y) * dirOut.x) / cross;
        points.push({ x: p1.x + dirIn.x * t, y: p1.y + dirIn.y * t });
      }
    }
    last.push(points.length - 1);
  }
  return { points, first, last };
}

function unitDir(aId, bId) {
  const a = STATIONS[aId];
  const b = STATIONS[bId];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
}

// Traces straight segments through screen points, rounding each change of
// direction with a small arc (clamped so it never eats more than half of
// either adjacent segment). Collinear points pass straight through.
function tracePath(ctx, pts, radius) {
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const r = Math.min(
      radius,
      Math.hypot(cur.x - prev.x, cur.y - prev.y) / 2,
      Math.hypot(next.x - cur.x, next.y - cur.y) / 2
    );
    ctx.arcTo(cur.x, cur.y, next.x, next.y, r);
  }
  const end = pts[pts.length - 1];
  ctx.lineTo(end.x, end.y);
}

// Finds which segment of a route/line path a given distance falls in and
// returns the interpolated point plus the index of the segment's trailing point.
function pointAtDistance(path, dist) {
  const { points, cumulative, total } = path;
  const d = Math.max(0, Math.min(total, dist));
  let i = 1;
  while (i < cumulative.length && cumulative[i] < d) i++;
  i = Math.min(i, points.length - 1);
  const segStart = cumulative[i - 1];
  const segLen = cumulative[i] - segStart || 1;
  const t = (d - segStart) / segLen;
  const a = points[i - 1];
  const b = points[i];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, segmentIndex: i - 1, t };
}

function worldToScreen(view, x, y) {
  return {
    x: x * view.scale + view.offsetX,
    y: y * view.scale + view.offsetY,
  };
}

function screenToWorld(view, x, y) {
  return {
    x: (x - view.offsetX) / view.scale,
    y: (y - view.offsetY) / view.scale,
  };
}

function stationScreenPos(view, id) {
  const s = STATIONS[id];
  return worldToScreen(view, s.x * UNIT, s.y * UNIT);
}

function findStationAt(view, screenX, screenY) {
  const world = screenToWorld(view, screenX, screenY);
  const hitRadiusWorld = (INTERCHANGE_RADIUS + 6) / view.scale;
  let closestId = null;
  let closestDist = Infinity;
  for (const id of Object.keys(STATIONS)) {
    const s = STATIONS[id];
    const dx = s.x * UNIT - world.x;
    const dy = s.y * UNIT - world.y;
    const dist = Math.hypot(dx, dy);
    if (dist < hitRadiusWorld && dist < closestDist) {
      closestDist = dist;
      closestId = id;
    }
  }
  return closestId;
}

function lineTrack(view, line) {
  return trackPolyline(view, line.stops, line.stops.slice(1).map(() => line.id));
}

function drawLine(ctx, view, line, opts) {
  ctx.strokeStyle = line.color;
  ctx.lineWidth = LINE_WIDTH * (opts.dimmed ? 0.85 : 1) * Math.sqrt(view.scale);
  ctx.globalAlpha = opts.dimmed ? 0.18 : 1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  tracePath(ctx, lineTrack(view, line).points, CORNER_RADIUS * Math.sqrt(view.scale));
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function stationRadius(view, id) {
  const isInterchange = STATION_LINES[id].length > 1;
  return (isInterchange ? INTERCHANGE_RADIUS : STATION_RADIUS) * Math.sqrt(view.scale);
}

function drawStation(ctx, view, id, opts) {
  const sp = stationScreenPos(view, id);
  const lines = STATION_LINES[id];
  const isInterchange = lines.length > 1;
  const radius = stationRadius(view, id) * (opts.hovered === id ? 1.35 : 1);

  ctx.globalAlpha = opts.dimmed ? 0.25 : 1;
  ctx.beginPath();
  ctx.arc(sp.x, sp.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = BG_COLOR;
  ctx.fill();
  ctx.lineWidth = (isInterchange ? 3 : 2.5) * Math.sqrt(view.scale);
  ctx.strokeStyle = isInterchange ? "#e8eaed" : lines[0] ? lineColor(lines[0]) : "#e8eaed";
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// --- Label placement ---
//
// Labels are fixed-size screen text but stations spread apart as you zoom, so
// placement is recomputed per zoom level. Each station tries a list of
// candidate spots in order of preference and takes the first that doesn't
// touch any track, station, or already-placed label; if none fits, its label
// is hidden until zooming in makes room. Important stations go first.

const D45 = Math.SQRT1_2;
// Candidate label spots. (ax, ay) is the anchor as a multiple of the gap from
// the station center, angle is the text direction, align is which end of the
// text sits at the anchor. The 45° ones are what WMATA uses along horizontal
// runs, where stations are too close together for flat labels; they're pushed
// further out so the text's near corner clears the track bundle.
const LABEL_CANDIDATES = [
  { ax: 1, ay: 0, angle: 0, align: "left" },
  { ax: -1, ay: 0, angle: 0, align: "right" },
  { ax: D45, ay: -D45, angle: 0, align: "left", dy: -LABEL_HEIGHT / 2 },
  { ax: D45, ay: D45, angle: 0, align: "left", dy: LABEL_HEIGHT / 2 },
  { ax: -D45, ay: -D45, angle: 0, align: "right", dy: -LABEL_HEIGHT / 2 },
  { ax: -D45, ay: D45, angle: 0, align: "right", dy: LABEL_HEIGHT / 2 },
  { ax: 0, ay: -1, angle: 0, align: "center", dy: -LABEL_HEIGHT / 2 },
  { ax: 0, ay: 1, angle: 0, align: "center", dy: LABEL_HEIGHT / 2 },
  { ax: D45, ay: -D45, angle: -Math.PI / 4, align: "left", rotated: true },
  { ax: -D45, ay: D45, angle: -Math.PI / 4, align: "right", rotated: true },
  { ax: D45, ay: D45, angle: Math.PI / 4, align: "left", rotated: true },
  { ax: -D45, ay: -D45, angle: Math.PI / 4, align: "right", rotated: true },
];

// Stations whose track runs only horizontally try the 45° spots first, so a
// horizontal stretch gets a consistent row of angled labels (as on WMATA's
// map) instead of flat labels that crowd out their neighbors.
const ROTATED_FIRST = [...LABEL_CANDIDATES.filter((c) => c.rotated), ...LABEL_CANDIDATES.filter((c) => !c.rotated)];
const HORIZONTAL_ONLY = (() => {
  const set = new Set();
  for (const id of Object.keys(STATIONS)) {
    const neighbors = LINES.flatMap((l) => {
      const i = l.stops.indexOf(id);
      return i < 0 ? [] : [l.stops[i - 1], l.stops[i + 1]].filter(Boolean);
    });
    if (neighbors.every((n) => STATIONS[n].y === STATIONS[id].y)) set.add(id);
  }
  return set;
})();

const labelWidths = new Map();
function labelWidth(ctx, id) {
  if (!labelWidths.has(id)) {
    // Measured bold, the widest a label is ever drawn, so pinned labels fit too.
    ctx.font = `600 ${LABEL_FONT_SIZE}px -apple-system, sans-serif`;
    labelWidths.set(id, ctx.measureText(STATIONS[id].name).width);
  }
  return labelWidths.get(id);
}

// A label's resolved position relative to its station's screen position:
// the text anchor, rotation and alignment, plus its bounding quad for collisions.
function labelPlacement(cand, gap, width) {
  const dist = cand.rotated ? gap * Math.SQRT2 + LABEL_HEIGHT / 2 : gap;
  const x = cand.ax * dist;
  const y = cand.ay * dist + (cand.dy || 0);
  const ux = Math.cos(cand.angle);
  const uy = Math.sin(cand.angle);
  const [from, to] = cand.align === "left" ? [0, width] : cand.align === "right" ? [-width, 0] : [-width / 2, width / 2];
  const pad = 2;
  const h = LABEL_HEIGHT / 2 + pad;
  const quad = [];
  for (const [along, across] of [[from - pad, -h], [to + pad, -h], [to + pad, h], [from - pad, h]]) {
    quad.push({ x: x + ux * along - uy * across, y: y + uy * along + ux * across });
  }
  return { x, y, angle: cand.angle, align: cand.align, quad };
}

// A thick segment (or any convex quad) as a collision shape with its bounding box.
function shape(quad) {
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  return { quad, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function segmentShape(a, b, halfWidth) {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = (-(b.y - a.y) / len) * halfWidth;
  const ny = ((b.x - a.x) / len) * halfWidth;
  const tx = ((b.x - a.x) / len) * halfWidth;
  const ty = ((b.y - a.y) / len) * halfWidth;
  return shape([
    { x: a.x - tx + nx, y: a.y - ty + ny },
    { x: b.x + tx + nx, y: b.y + ty + ny },
    { x: b.x + tx - nx, y: b.y + ty - ny },
    { x: a.x - tx - nx, y: a.y - ty - ny },
  ]);
}

function boxShape(cx, cy, halfW, halfH) {
  return shape([
    { x: cx - halfW, y: cy - halfH },
    { x: cx + halfW, y: cy - halfH },
    { x: cx + halfW, y: cy + halfH },
    { x: cx - halfW, y: cy + halfH },
  ]);
}

// Separating-axis test for two convex quads (both are rectangles, so each
// contributes two edge normals as candidate axes).
function shapesOverlap(a, b) {
  if (a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY) return false;
  for (const poly of [a.quad, b.quad]) {
    for (let i = 0; i < 2; i++) {
      const p = poly[i];
      const q = poly[i + 1];
      const axisX = -(q.y - p.y);
      const axisY = q.x - p.x;
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const v of a.quad) {
        const d = v.x * axisX + v.y * axisY;
        minA = Math.min(minA, d);
        maxA = Math.max(maxA, d);
      }
      for (const v of b.quad) {
        const d = v.x * axisX + v.y * axisY;
        minB = Math.min(minB, d);
        maxB = Math.max(maxB, d);
      }
      if (maxA < minB || maxB < minA) return false;
    }
  }
  return true;
}

// Distance from a station's center to where its label may start: past the
// station marker and past the outermost of any parallel tracks through it.
function labelGap(view, id, endpointIds) {
  const s = Math.sqrt(view.scale);
  const marker = endpointIds.has(id) ? MARKER_RADIUS * s : stationRadius(view, id);
  const bundle = STATION_BUNDLE[id] * PARALLEL_SPACING * s + (ROUTE_LINE_WIDTH * s) / 2;
  return Math.max(marker, bundle) + 4;
}

let labelCache = null;

// Picks a spot (or none) for every visible station's label. Computed in
// screen space with no pan offset — placements are relative to the station,
// so panning reuses them and only zooming or a change of what's on the map
// triggers a recompute.
function layoutLabels(ctx, view, visibleLines, stationIds, priorityIds, endpointIds) {
  const key = [view.scale, visibleLines.map((l) => l.id), [...priorityIds], [...endpointIds]].join("|");
  if (labelCache && labelCache.key === key) return labelCache.placements;

  const origin = { scale: view.scale, offsetX: 0, offsetY: 0 };
  const obstacles = [];
  const trackHalfWidth = (ROUTE_LINE_WIDTH * Math.sqrt(view.scale)) / 2 + 1;
  for (const line of visibleLines) {
    const pts = lineTrack(origin, line).points;
    for (let i = 0; i < pts.length - 1; i++) obstacles.push(segmentShape(pts[i], pts[i + 1], trackHalfWidth));
  }
  const stationShapes = new Map();
  for (const id of stationIds) {
    const sp = stationScreenPos(origin, id);
    const r = (endpointIds.has(id) ? MARKER_RADIUS * Math.sqrt(view.scale) : stationRadius(view, id)) + 1;
    stationShapes.set(id, boxShape(sp.x, sp.y, r, r));
  }
  // The START / DESTINATION captions drawn above journey endpoints.
  for (const id of endpointIds) {
    const sp = stationScreenPos(origin, id);
    const top = sp.y - MARKER_RADIUS * Math.sqrt(view.scale) - 10;
    obstacles.push(boxShape(sp.x, top, 40, LABEL_HEIGHT / 2 + 1));
  }

  const rank = (id) => {
    if (priorityIds.has(id)) return 0;
    if (JUNCTIONS.has(id)) return 1;
    if (TERMINI.has(id)) return 2;
    return 3;
  };
  const ordered = [...stationIds].sort((a, b) => rank(a) - rank(b));

  const placements = new Map();
  const placedShapes = [];
  const tryPlace = (id, avoidTracks) => {
    const sp = stationScreenPos(origin, id);
    const gap = labelGap(view, id, endpointIds);
    const width = labelWidth(ctx, id);
    for (const cand of HORIZONTAL_ONLY.has(id) ? ROTATED_FIRST : LABEL_CANDIDATES) {
      const placement = labelPlacement(cand, gap, width);
      const box = shape(placement.quad.map((p) => ({ x: p.x + sp.x, y: p.y + sp.y })));
      const blocked =
        (avoidTracks && obstacles.some((o) => shapesOverlap(box, o))) ||
        placedShapes.some((o) => shapesOverlap(box, o)) ||
        [...stationShapes].some(([sid, o]) => sid !== id && shapesOverlap(box, o));
      if (!blocked) {
        placements.set(id, { ...placement, backed: !avoidTracks });
        placedShapes.push(box);
        return true;
      }
    }
    return false;
  };
  for (const id of ordered) {
    // Junctions and route stops are too important to drop: if every spot
    // crosses a track, settle for one that only crosses track (drawn on a
    // backing plate), as long as it's still clear of other labels.
    if (!tryPlace(id, true) && rank(id) <= 1) tryPlace(id, false);
  }

  labelCache = { key, placements };
  return placements;
}

// Draws a label at its placement. `forced` labels (ones that must show even
// without a spot clear of track) get a solid backing so they stay legible
// over whatever they overlap.
function drawLabel(ctx, view, id, placement, opts) {
  const sp = stationScreenPos(view, id);
  const name = STATIONS[id].name;
  ctx.save();
  ctx.globalAlpha = opts.dimmed ? 0.3 : 1;
  ctx.translate(sp.x + placement.x, sp.y + placement.y);
  ctx.rotate(placement.angle);
  ctx.font = `${opts.pinned ? "600 " : ""}${LABEL_FONT_SIZE}px -apple-system, sans-serif`;
  ctx.textAlign = placement.align;
  ctx.textBaseline = "middle";
  if (opts.forced) {
    const w = ctx.measureText(name).width;
    const left = placement.align === "left" ? 0 : placement.align === "right" ? -w : -w / 2;
    ctx.fillStyle = "rgba(11, 13, 16, 0.85)";
    ctx.fillRect(left - 4, -LABEL_HEIGHT / 2 - 2, w + 8, LABEL_HEIGHT + 4);
  }
  // A dark halo keeps text crisp where it passes close to a track.
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.strokeStyle = BG_COLOR;
  ctx.strokeText(name, 0, 0);
  ctx.fillStyle = opts.pinned ? "#ffffff" : "#c7cad1";
  ctx.fillText(name, 0, 0);
  ctx.restore();
}

function drawEndpointMarker(ctx, view, id, label, color) {
  if (!id) return;
  const sp = stationScreenPos(view, id);
  const r = MARKER_RADIUS * Math.sqrt(view.scale);
  ctx.beginPath();
  ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 * Math.sqrt(view.scale);
  ctx.stroke();
  ctx.font = `700 11px -apple-system, sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(label, sp.x, sp.y - r - 10);
  ctx.textAlign = "left";
}

const SEARCH_COLOR = "#ffd166";
const FOUND_COLOR = "#7ee787";

// Where a journey's animation is at `time`. A journey plays in three phases:
//   "search" — replays the router's search, lighting up stations as it reaches them
//   "found"  — the destination flashes and the chosen route fades in
//   "ride"   — the train travels the route
// Returns the phase plus progress values the renderer and status text need.
function journeyState(journey, time) {
  const elapsed = Math.max(0, time - journey.startTime);
  const { searchDuration, foundDuration, duration, explored } = journey;
  if (elapsed < searchDuration) {
    const searchT = elapsed / searchDuration;
    const visitedCount = Math.min(explored.length, Math.floor(searchT * explored.length) + 1);
    return { phase: "search", visitedCount, searchFade: 1, foundT: 0, t: 0 };
  }
  const afterSearch = elapsed - searchDuration;
  const visitedCount = explored.length;
  if (afterSearch < foundDuration) {
    const foundT = afterSearch / foundDuration;
    return { phase: "found", visitedCount, searchFade: 1 - foundT * 0.75, foundT, t: 0 };
  }
  const t = Math.min(1, (afterSearch - foundDuration) / duration);
  return { phase: "ride", visitedCount, searchFade: 0.25, foundT: 1, t };
}

// Draws the stations (and the edges they were reached along) that the search
// has visited so far, with the most recently reached station emphasized.
function drawSearch(ctx, view, journey, state) {
  const { explored } = journey;
  const scale = Math.sqrt(view.scale);
  ctx.globalAlpha = state.searchFade;

  ctx.strokeStyle = SEARCH_COLOR;
  ctx.lineWidth = 2.5 * scale;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i < state.visitedCount; i++) {
    const { id, from } = explored[i];
    if (!from) continue;
    const a = stationScreenPos(view, from);
    const b = stationScreenPos(view, id);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.globalAlpha = state.searchFade * 0.55;
  ctx.stroke();

  ctx.globalAlpha = state.searchFade;
  for (let i = 0; i < state.visitedCount; i++) {
    const sp = stationScreenPos(view, explored[i].id);
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, STATION_RADIUS * 1.15 * scale, 0, Math.PI * 2);
    ctx.fillStyle = SEARCH_COLOR;
    ctx.fill();
  }

  // The station the search just reached gets a halo while the search runs.
  if (state.phase === "search") {
    const current = explored[state.visitedCount - 1];
    const sp = stationScreenPos(view, current.id);
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, MARKER_RADIUS * 1.2 * scale, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2 * scale;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Expanding rings around the destination the moment the search finds it.
function drawFoundPulse(ctx, view, id, foundT) {
  const sp = stationScreenPos(view, id);
  const scale = Math.sqrt(view.scale);
  for (const delay of [0, 0.25]) {
    const p = (foundT - delay) / (1 - delay);
    if (p <= 0 || p >= 1) continue;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, MARKER_RADIUS * scale * (1 + p * 2.2), 0, Math.PI * 2);
    ctx.strokeStyle = FOUND_COLOR;
    ctx.globalAlpha = 1 - p;
    ctx.lineWidth = 3 * scale;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function routeTrack(view, path) {
  return trackPolyline(view, path.stationIds, path.hops.map((h) => h.lineId));
}

// Draws the highlighted route path, colored per line segment.
function drawRoute(ctx, view, journey, state) {
  const { path } = journey;
  const track = routeTrack(view, path);

  // Group consecutive same-line hops into runs (by station index) so each
  // run is drawn as one stroke in its line's color.
  const runs = [];
  for (let i = 0; i < path.hops.length; i++) {
    const lineId = path.hops[i].lineId;
    let run = runs[runs.length - 1];
    if (!run || run.lineId !== lineId) {
      run = { lineId, from: i, to: i + 1 };
      runs.push(run);
    }
    run.to = i + 1;
  }

  ctx.globalAlpha = Math.min(1, state.foundT * 1.5);
  for (const run of runs) {
    const pts = track.points.slice(track.last[run.from], track.first[run.to] + 1);
    ctx.beginPath();
    tracePath(ctx, pts, CORNER_RADIUS * Math.sqrt(view.scale));
    ctx.strokeStyle = lineColor(run.lineId);
    ctx.lineWidth = ROUTE_LINE_WIDTH * Math.sqrt(view.scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Draws the train at its current point along the route.
function drawRidingTrain(ctx, view, journey, state) {
  const { path } = journey;
  const track = routeTrack(view, path);

  // Travel progress is measured in world distance (so speed is constant),
  // then mapped onto the same on-screen hop the route is drawn along.
  const pos = pointAtDistance(path, state.t * path.total);
  const segIndex = Math.min(pos.segmentIndex, path.hops.length - 1);
  const a = track.points[track.last[segIndex]];
  const b = track.points[track.first[segIndex + 1]];
  const sp = { x: a.x + (b.x - a.x) * pos.t, y: a.y + (b.y - a.y) * pos.t };

  // Heading of each hop; near either end of a hop the train eases halfway
  // toward the neighboring hop's heading so it turns through bends rather
  // than snapping to the new direction at the station.
  const heading = (i) => {
    const p = track.points[track.last[i]];
    const q = track.points[track.first[i + 1]];
    return Math.atan2(q.y - p.y, q.x - p.x);
  };
  const TURN_ZONE = 0.2;
  let angle = heading(segIndex);
  if (pos.t > 1 - TURN_ZONE && segIndex < path.hops.length - 1) {
    angle = lerpAngle(angle, heading(segIndex + 1), ((pos.t - (1 - TURN_ZONE)) / TURN_ZONE) * 0.5);
  } else if (pos.t < TURN_ZONE && segIndex > 0) {
    angle = lerpAngle(heading(segIndex - 1), angle, 0.5 + (pos.t / TURN_ZONE) * 0.5);
  }

  drawTrain(ctx, sp.x, sp.y, angle, lineColor(path.hops[segIndex].lineId), Math.sqrt(view.scale));
}

// Interpolates between two angles the short way around.
function lerpAngle(from, to, t) {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

// A train seen from above, centered on (x, y) and pointing along `angle`:
// a rounded lead car with a windshield at the nose, trailing cars behind it,
// a stripe of the line's color down the roof, and darker roof units. The
// body is light (not the line color) so it reads clearly on top of the route.
function drawTrain(ctx, x, y, angle, color, s) {
  const L = TRAIN_CAR_LENGTH * s;
  const W = TRAIN_CAR_WIDTH * s;
  const gap = 1.5 * s;
  const corner = 1.5 * s;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Cars laid out back from the nose, with the whole train centered on (x, y).
  const total = TRAIN_CAR_COUNT * L + (TRAIN_CAR_COUNT - 1) * gap;
  const cars = [];
  for (let i = 0; i < TRAIN_CAR_COUNT; i++) {
    const carX = total / 2 - L - i * (L + gap);
    // Lead car gets a rounded nose.
    cars.push({ x: carX, radii: i === 0 ? [corner, W / 2, W / 2, corner] : corner });
  }

  // Couplers between the cars.
  ctx.fillStyle = BG_COLOR;
  for (let i = 1; i < cars.length; i++) {
    ctx.fillRect(cars[i].x + L - gap / 2, -W * 0.15, gap * 2, W * 0.3);
  }

  ctx.lineWidth = 1.5 * s;
  ctx.strokeStyle = BG_COLOR;
  for (const car of cars) {
    ctx.beginPath();
    ctx.roundRect(car.x, -W / 2, L, W, car.radii);
    ctx.fillStyle = TRAIN_BODY_COLOR;
    ctx.fill();
    ctx.stroke();

    // Line-colored stripe down the roof.
    ctx.fillStyle = color;
    ctx.fillRect(car.x + L * 0.08, -W * 0.18, L * 0.72, W * 0.36);

    // Roof units.
    ctx.fillStyle = "rgba(11, 13, 16, 0.55)";
    for (const at of [0.2, 0.52]) {
      ctx.fillRect(car.x + L * at, -W * 0.12, L * 0.16, W * 0.24);
    }
  }

  // Windshield across the lead car's nose.
  ctx.beginPath();
  ctx.roundRect(cars[0].x + L * 0.8, -W * 0.36, L * 0.1, W * 0.72, 1 * s);
  ctx.fillStyle = BG_COLOR;
  ctx.fill();

  ctx.restore();
}

function drawJourney(ctx, view, journey, state) {
  drawSearch(ctx, view, journey, state);
  if (state.phase !== "search") drawRoute(ctx, view, journey, state);
  drawEndpointMarker(ctx, view, journey.startId, "START", "#4fd1c5");
  drawEndpointMarker(ctx, view, journey.endId, "DESTINATION", state.phase === "search" ? "#ff6b6b" : FOUND_COLOR);
  if (state.phase === "found") drawFoundPulse(ctx, view, journey.endId, state.foundT);
  // Drawn last so it rides over the endpoint rings rather than under them.
  if (state.phase === "ride") drawRidingTrain(ctx, view, journey, state);
}

function draw(ctx, width, height, view, time, ui) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, width, height);

  const visibleLines = LINES.filter((l) => !ui.hiddenLines.has(l.id));
  const journey = ui.journey;
  const state = journey ? journeyState(journey, time) : null;
  // Stations kept bright: while searching, those reached so far; afterwards, the route's.
  let litStationIds = null;
  let pinnedIds = new Set();
  // Stations whose labels claim space first. Kept fixed for a whole phase
  // (not per search step) so labels don't reshuffle as the search advances.
  let priorityIds = new Set();
  const endpointIds = journey ? new Set([journey.startId, journey.endId]) : new Set();
  let currentSearchId = null;
  if (journey && state.phase === "search") {
    litStationIds = new Set(journey.explored.slice(0, state.visitedCount).map((e) => e.id));
    litStationIds.add(journey.endId);
    currentSearchId = journey.explored[state.visitedCount - 1].id;
    pinnedIds = new Set([...endpointIds, currentSearchId]);
    priorityIds = endpointIds;
  } else if (journey) {
    litStationIds = new Set(journey.path.stationIds);
    pinnedIds = litStationIds;
    priorityIds = litStationIds;
  }

  for (const line of visibleLines) {
    // When a journey is active, the base line layer is dimmed everywhere;
    // drawJourney() overlays a bright stroke on just the traveled segments.
    drawLine(ctx, view, line, { dimmed: Boolean(journey) });
  }

  const visibleLineIds = new Set(visibleLines.map((l) => l.id));
  const visibleStationIds = Object.keys(STATIONS).filter((id) =>
    STATION_LINES[id].some((lid) => visibleLineIds.has(lid))
  );
  for (const id of visibleStationIds) {
    const dimmed = litStationIds ? !litStationIds.has(id) : false;
    drawStation(ctx, view, id, { dimmed, hovered: ui.hoveredStation });
  }

  const placements = layoutLabels(ctx, view, visibleLines, visibleStationIds, priorityIds, endpointIds);
  for (const [id, placement] of placements) {
    const dimmed = litStationIds ? !litStationIds.has(id) : false;
    drawLabel(ctx, view, id, placement, { dimmed, pinned: pinnedIds.has(id), forced: placement.backed });
  }

  if (journey) drawJourney(ctx, view, journey, state);

  // The station the search is on always gets named, even if its label had to
  // be hidden for space.
  if (currentSearchId && !placements.has(currentSearchId)) {
    const placement = labelPlacement(LABEL_CANDIDATES[0], labelGap(view, currentSearchId, endpointIds), 0);
    drawLabel(ctx, view, currentSearchId, placement, { pinned: true, forced: true });
  }
  return state;
}

window.MetroRender = {
  UNIT,
  STATION_LINES,
  pointAtDistance,
  worldToScreen,
  screenToWorld,
  stationScreenPos,
  findStationAt,
  draw,
};

})();
