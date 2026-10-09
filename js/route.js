(function () {
const { STATIONS, LINES } = window.MetroData;
const { UNIT } = window.MetroRender;

// Penalty (in world px) added when a route switches lines, so the router
// prefers staying on one train over a marginally shorter path with an extra transfer.
const TRANSFER_PENALTY = UNIT * 6;
const START_MARK = "__start__";

const ADJACENCY = (() => {
  const map = new Map();
  for (const id of Object.keys(STATIONS)) map.set(id, []);
  for (const line of LINES) {
    for (let i = 0; i < line.stops.length - 1; i++) {
      const a = line.stops[i];
      const b = line.stops[i + 1];
      const sa = STATIONS[a];
      const sb = STATIONS[b];
      const dist = Math.hypot((sb.x - sa.x) * UNIT, (sb.y - sa.y) * UNIT);
      map.get(a).push({ to: b, lineId: line.id, dist });
      map.get(b).push({ to: a, lineId: line.id, dist });
    }
  }
  return map;
})();

const ALGORITHMS = [
  { id: "dijkstra", name: "Dijkstra" },
  { id: "astar", name: "A*" },
  { id: "bfs", name: "Breadth-first (BFS)" },
  { id: "dfs", name: "Depth-first (DFS)" },
];

// Finds a route from startId to endId with the chosen search algorithm.
// Returns { hops, explored } or null if start === end, where hops is the
// ordered route [{ from, to, lineId }, ...] and explored is every station the
// search settled, in the order it reached them ([{ id, from }, ...], `from`
// being the station it was reached from), so the search can be replayed.
function findRoute(startId, endId, algorithm = "dijkstra") {
  if (!startId || !endId || startId === endId) return null;
  if (algorithm === "bfs" || algorithm === "dfs") return graphSearch(startId, endId, algorithm);
  return bestFirstSearch(startId, endId, algorithm === "astar");
}

// Straight-line world distance between two stations: A*'s estimate of the
// remaining cost. It never overestimates (track is never shorter than a
// straight line), so A* still finds the same optimal route as Dijkstra.
function straightLineDist(aId, bId) {
  const a = STATIONS[aId];
  const b = STATIONS[bId];
  return Math.hypot((b.x - a.x) * UNIT, (b.y - a.y) * UNIT);
}

// Dijkstra (or A*, with useHeuristic) over (station, arrivalLine) states so
// line changes can be penalized.
function bestFirstSearch(startId, endId, useHeuristic) {
  const dist = new Map();
  const prev = new Map();
  const startState = `${startId}::${START_MARK}`;
  dist.set(startState, 0);

  const visited = new Set();
  const explored = [];
  const exploredIds = new Set();
  let endState = null;

  while (true) {
    let u = null;
    let best = Infinity;
    let bestPriority = Infinity;
    for (const [state, d] of dist) {
      if (visited.has(state)) continue;
      const priority = useHeuristic ? d + straightLineDist(state.slice(0, state.lastIndexOf("::")), endId) : d;
      if (priority < bestPriority) {
        bestPriority = priority;
        best = d;
        u = state;
      }
    }
    if (u === null) break;
    visited.add(u);

    const sep = u.lastIndexOf("::");
    const stationId = u.slice(0, sep);
    const viaLine = u.slice(sep + 2);

    // A station can be settled more than once (once per arrival line); only
    // its first settle is the moment the search actually "reaches" it.
    if (!exploredIds.has(stationId)) {
      exploredIds.add(stationId);
      explored.push({ id: stationId, from: prev.get(u)?.from ?? null });
    }

    if (stationId === endId) {
      endState = u;
      break;
    }

    for (const edge of ADJACENCY.get(stationId) || []) {
      const transferPenalty = viaLine !== START_MARK && viaLine !== edge.lineId ? TRANSFER_PENALTY : 0;
      const nd = best + edge.dist + transferPenalty;
      const vState = `${edge.to}::${edge.lineId}`;
      if (nd < (dist.get(vState) ?? Infinity)) {
        dist.set(vState, nd);
        prev.set(vState, { state: u, from: stationId, to: edge.to, lineId: edge.lineId });
      }
    }
  }

  if (!endState) return null;

  const hops = [];
  let cur = endState;
  while (prev.has(cur)) {
    const p = prev.get(cur);
    hops.push({ from: p.from, to: p.to, lineId: p.lineId });
    cur = p.state;
  }
  hops.reverse();
  return { hops, explored };
}

// Unweighted BFS (queue) or DFS (stack) over stations, ignoring distances and
// transfers: BFS finds a route with the fewest stops, DFS just the first route
// it stumbles into, which is usually far from the best.
function graphSearch(startId, endId, algorithm) {
  const frontier = [{ id: startId, from: null }];
  const parent = new Map();
  const explored = [];

  while (frontier.length) {
    const node = algorithm === "bfs" ? frontier.shift() : frontier.pop();
    if (parent.has(node.id)) continue;
    parent.set(node.id, node.from);
    explored.push(node);
    if (node.id === endId) break;

    const neighbors = ADJACENCY.get(node.id) || [];
    // DFS pops from the end, so push in reverse to explore neighbors in listed order.
    const ordered = algorithm === "dfs" ? [...neighbors].reverse() : neighbors;
    for (const edge of ordered) {
      if (!parent.has(edge.to)) frontier.push({ id: edge.to, from: node.id });
    }
  }

  if (!parent.has(endId)) return null;

  const stationPath = [endId];
  while (parent.get(stationPath[0])) stationPath.unshift(parent.get(stationPath[0]));
  return { hops: assignLines(stationPath), explored };
}

// Picks a line for each hop of a bare station path. Where several lines share
// a stretch of track, stays on the current line if it continues, otherwise
// boards whichever line runs furthest along the path, to avoid needless transfers.
function assignLines(stationPath) {
  const edgeLines = [];
  for (let i = 0; i < stationPath.length - 1; i++) {
    const edges = ADJACENCY.get(stationPath[i]).filter((e) => e.to === stationPath[i + 1]);
    edgeLines.push(edges.map((e) => e.lineId));
  }
  const runLength = (lineId, from) => {
    let n = 0;
    while (from + n < edgeLines.length && edgeLines[from + n].includes(lineId)) n++;
    return n;
  };

  const hops = [];
  let current = null;
  for (let i = 0; i < edgeLines.length; i++) {
    if (!edgeLines[i].includes(current)) {
      current = edgeLines[i].reduce((a, b) => (runLength(b, i) > runLength(a, i) ? b : a));
    }
    hops.push({ from: stationPath[i], to: stationPath[i + 1], lineId: current });
  }
  return hops;
}

// Builds a drawable/animatable path from route hops: world-space points,
// cumulative distance at each point, and the line id serving each segment.
function buildRoutePath(hops) {
  const points = [STATIONS[hops[0].from]].concat(hops.map((h) => STATIONS[h.to]));
  const worldPoints = points.map((s) => ({ x: s.x * UNIT, y: s.y * UNIT }));
  const cumulative = [0];
  for (let i = 1; i < worldPoints.length; i++) {
    const dx = worldPoints[i].x - worldPoints[i - 1].x;
    const dy = worldPoints[i].y - worldPoints[i - 1].y;
    cumulative.push(cumulative[i - 1] + Math.hypot(dx, dy));
  }
  const stationIds = [hops[0].from, ...hops.map((h) => h.to)];
  return {
    points: worldPoints,
    stationIds,
    cumulative,
    total: cumulative[cumulative.length - 1],
    hops,
  };
}

function transferCount(hops) {
  let count = 0;
  for (let i = 1; i < hops.length; i++) {
    if (hops[i].lineId !== hops[i - 1].lineId) count++;
  }
  return count;
}

window.MetroRoute = { ALGORITHMS, findRoute, buildRoutePath, transferCount };

})();
