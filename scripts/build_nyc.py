"""Builds js/data-nyc.js from the MTA's GTFS feed + Stations.csv.

Download and unzip http://web.mta.info/developers/data/nyct/subway/google_transit.zip
into a folder, put http://web.mta.info/developers/data/nyct/subway/Stations.csv
next to it, then:

    python3 scripts/build_nyc.py <gtfs_dir> js/data-nyc.js

The map is a schematic in the style of the D.C. diagram: every stretch of
track runs horizontally, vertically or at 45°. The network is split into
corridors between junctions and terminals; junctions sit at hand-picked grid
positions (PINS, in nyc_layout.py) or, failing that, at a fisheye-distorted
geographic position snapped to the grid. Each corridor is then drawn as at
most three octilinear legs between its ends, with its stations spaced evenly
along it. Bends that don't land on a station get an invisible waypoint.
"""
import csv, json, math, os, sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nyc_layout import PINS, STYLES, NODE_NAMES, SPLITS, SHARED_TRACK

gtfs, out_path = sys.argv[1], sys.argv[2]

ROUTES = ["1", "2", "3", "4", "5", "6", "7", "A", "C", "E", "B", "D", "F", "M",
          "G", "J", "Z", "L", "N", "Q", "R", "W", "GS", "FS", "H"]
SHUTTLE_LABELS = {"GS": "42 St Shuttle", "FS": "Franklin Av Shuttle", "H": "Rockaway Park Shuttle"}
COLORS = {
    "1": "#ee352e", "2": "#ee352e", "3": "#ee352e",
    "4": "#00933c", "5": "#00933c", "6": "#00933c",
    "7": "#b933ad",
    "A": "#0039a6", "C": "#0039a6", "E": "#0039a6",
    "B": "#ff6319", "D": "#ff6319", "F": "#ff6319", "M": "#ff6319",
    "G": "#6cbe45", "J": "#996633", "Z": "#996633", "L": "#a7a9ac",
    "N": "#fccc0a", "Q": "#fccc0a", "R": "#fccc0a", "W": "#fccc0a",
    "GS": "#808183", "FS": "#808183", "H": "#808183",
}
DARK_TEXT = {"N", "Q", "R", "W"}

def rows(name):
    with open(f"{gtfs}/{name}", newline="", encoding="utf-8-sig") as f:
        yield from csv.DictReader(f)

# --- Stations: one node per station complex, except complexes in SPLITS,
# whose platforms on different avenues become separate nodes joined by a
# walking transfer (as the MTA map draws them) ---
stop_to_node = {}
node_members = defaultdict(list)
for r in rows("Stations.csv"):
    cid = r["Complex ID"]
    node = cid
    for suffix, routes in SPLITS.get(cid, {}).items():
        if set(r["Daytime Routes"].split()) & routes:
            node = cid + suffix
    stop_to_node[r["GTFS Stop ID"]] = node
    node_members[node].append(r)

# --- Typical weekday daytime stopping patterns per route ---
trips = {}
for r in rows("trips.txt"):
    if r["route_id"] in ROUTES and r["service_id"] == "Weekday" and r["direction_id"] == "1":
        trips[r["trip_id"]] = r["route_id"]

trip_stops = defaultdict(list)
trip_start = {}
for r in rows("stop_times.txt"):
    tid = r["trip_id"]
    if tid not in trips:
        continue
    trip_stops[tid].append((int(r["stop_sequence"]), r["stop_id"][:-1]))
    if int(r["stop_sequence"]) == 1:
        trip_start[tid] = r["departure_time"]

patterns = defaultdict(Counter)
for tid, stops in trip_stops.items():
    hour = int(trip_start[tid].split(":")[0])
    if not 6 <= hour < 20:
        continue
    seq = []
    for _, stop in sorted(stops):
        n = stop_to_node[stop]
        if not seq or seq[-1] != n:
            seq.append(n)
    patterns[trips[tid]][tuple(seq)] += 1

branches = {}
for route in ROUTES:
    ranked = patterns[route].most_common()
    top = ranked[0][1]
    # Of the common patterns, longest first, so a full run wins over short turns.
    candidates = sorted((seq for seq, count in ranked if count >= top * 0.15), key=len, reverse=True)
    chosen = []
    covered = set()
    for seq in candidates:
        # A real branch adds a run of stations no chosen pattern covers yet.
        if chosen and len(set(seq) - covered) < 3:
            continue
        chosen.append(list(seq))
        covered |= set(seq)
    branches[route] = chosen

used = sorted({n for bs in branches.values() for b in bs for n in b})
transfers = [(cid, cid + suffix) for cid, splits in SPLITS.items() for suffix in splits
             if cid in used and cid + suffix in used]

def name_of(n):
    if n in NODE_NAMES:
        return NODE_NAMES[n]
    names = Counter(m["Stop Name"] for m in node_members[n])
    return max(names.items(), key=lambda kv: (kv[1], -len(kv[0])))[0]

names = {n: name_of(n) for n in used}

# --- Geography (km), rotated so Manhattan's avenues run vertically ---
LAT0, LON0 = 40.75, -73.98
ROT = math.radians(-29)
def project(lat, lon):
    x = (lon - LON0) * math.cos(math.radians(LAT0)) * 111.32
    y = -(lat - LAT0) * 110.57
    return (x * math.cos(ROT) - y * math.sin(ROT), x * math.sin(ROT) + y * math.cos(ROT))

geo = {}
for n in used:
    pts = [project(float(m["GTFS Latitude"]), float(m["GTFS Longitude"])) for m in node_members[n]]
    geo[n] = (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))

# --- Express hops: run them alongside the local track they share ---
all_seqs = [b for bs in branches.values() for b in bs]
def dist_along(seq):
    return sum(math.dist(geo[a], geo[b]) for a, b in zip(seq, seq[1:]))

def via_for(a, b):
    best = None
    for seq in all_seqs:
        for s in (seq, seq[::-1]):
            if a in s and b in s:
                i, j = s.index(a), s.index(b)
                if 1 < j - i <= 14:
                    mid = s[i + 1:j]
                    # Same corridor, not a detour by some other route.
                    if dist_along([a, *mid, b]) <= 1.6 * math.dist(geo[a], geo[b]):
                        if best is None or len(mid) < len(best):
                            best = mid
    return best or []

shared = {}
for (route, a, b), mid in SHARED_TRACK.items():
    shared[(route, a, b)] = mid

def expand(route, seq):
    out = [seq[0]]
    for a, b in zip(seq, seq[1:]):
        key = (route, names[a], names[b])
        rkey = (route, names[b], names[a])
        if key in shared:
            mid = [resolve(m) for m in shared[key]]
        elif rkey in shared:
            mid = [resolve(m) for m in reversed(shared[rkey])]
        else:
            mid = via_for(a, b)
        out.extend("~" + m for m in mid)
        out.append(b)
    return out

def resolve(name):
    """A PINS/STYLES key: a station name, or "name@route" when names repeat."""
    nm, _, route = name.partition("@")
    hits = [n for n in used if names[n] == nm and (not route or any(n in b for b in branches[route]))]
    if len(hits) != 1:
        sys.exit(f"{name!r} matches {len(hits)} stations")
    return hits[0]

line_paths = {route: [expand(route, b) for b in branches[route]] for route in ROUTES}

# --- Track graph and its corridors ---
adj = defaultdict(set)
termini = set()
for paths in line_paths.values():
    for p in paths:
        ids = [s.lstrip("~") for s in p]
        for a, b in zip(ids, ids[1:]):
            adj[a].add(b)
            adj[b].add(a)
        termini |= {ids[0], ids[-1]}

pins = {resolve(k): v for k, v in PINS.items()}
keys = {n for n in used if len(adj[n]) != 2 or n in termini or n in pins}

chains = []
seen = set()
for k in sorted(keys):
    for nb in sorted(adj[k]):
        if frozenset((k, nb)) in seen:
            continue
        chain = [k, nb]
        seen.add(frozenset((k, nb)))
        while chain[-1] not in keys:
            nxt = next(x for x in adj[chain[-1]] if x != chain[-2])
            seen.add(frozenset((chain[-1], nxt)))
            chain.append(nxt)
        chains.append(chain)

# --- Junction positions ---
# Fisheye: magnify around Midtown/Downtown so Manhattan gets room, like the
# MTA map does, then stretch crosstown a little more.
CENTER = (0.3, 2.0)   # km, around Union Sq
UNITS_PER_KM = 1.15
MAG_X, MAG_Y, RADIUS = 2.0, 1.2, 5.0
def fisheye(p):
    dx, dy = p[0] - CENTER[0], p[1] - CENTER[1]
    u = (dx * dx + dy * dy) / RADIUS ** 2
    return (dx * (1 + MAG_X * math.exp(-u)) * UNITS_PER_KM, dy * (1 + MAG_Y * math.exp(-u)) * UNITS_PER_KM)

auto = {n: fisheye(geo[n]) for n in used}
def snap(p, step=0.5):
    return (round(p[0] / step) * step, round(p[1] / step) * step)

pos = {}
for k in keys:
    pos[k] = tuple(pins[k]) if k in pins else snap(auto[k])

DIRS = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)]
SPACING = 1.0

# Unpinned dead ends hang straight off their corridor in the nearest
# octilinear direction, with stations at the standard spacing.
for chain in chains:
    for c in (chain, chain[::-1]):
        end = c[-1]
        if len(adj[end]) == 1 and end not in pins:
            dx, dy = auto[end][0] - auto[c[0]][0], auto[end][1] - auto[c[0]][1]
            d = max(DIRS, key=lambda v: (v[0] * dx + v[1] * dy) / math.hypot(*v))
            length = (len(c) - 1) * SPACING
            step = length / math.hypot(*d)
            pos[end] = (pos[c[0]][0] + d[0] * step, pos[c[0]][1] + d[1] * step)

def legs(a, b, style):
    """Octilinear polyline a -> b: one diagonal leg plus straight legs, or
    through explicitly given corner points."""
    if isinstance(style, list):
        return [a, *[tuple(p) for p in style], b]
    dx, dy = b[0] - a[0], b[1] - a[1]
    if abs(dx) < 1e-9 or abs(dy) < 1e-9 or abs(abs(dx) - abs(dy)) < 1e-9:
        return [a, b]
    d = min(abs(dx), abs(dy))
    diag = (math.copysign(d, dx), math.copysign(d, dy))
    rest = (dx - diag[0], dy - diag[1])
    if style == "start":
        return [a, (a[0] + diag[0], a[1] + diag[1]), b]
    if style == "end":
        return [a, (a[0] + rest[0], a[1] + rest[1]), b]
    h = (rest[0] / 2, rest[1] / 2)
    return [a, (a[0] + h[0], a[1] + h[1]), (a[0] + h[0] + diag[0], a[1] + h[1] + diag[1]), b]

def place_along(poly, count):
    """`count` evenly spaced points strictly inside the polyline, each with
    its arc position; plus the polyline's corner arc positions."""
    seglens = [math.dist(p, q) for p, q in zip(poly, poly[1:])]
    total = sum(seglens)
    def at(s):
        for (p, q), L in zip(zip(poly, poly[1:]), seglens):
            if s <= L + 1e-9:
                t = s / L if L else 0
                return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)
            s -= L
        return poly[-1]
    corners = []
    acc = 0
    for L in seglens[:-1]:
        acc += L
        corners.append(acc)
    return total, at, corners

waypoints = {}       # id -> (x, y)
edge_inserts = {}    # (a, b) -> [waypoint ids between a and b, in a -> b order]
spacing_report = []

# STYLES keys are "from>to" by name, optionally "from>to~via" naming a station
# on the corridor, to tell apart parallel corridors with the same ends.
def chain_style(chain):
    a, b = names[chain[0]], names[chain[-1]]
    inner = {names.get(n) for n in chain[1:-1]}
    for key, value in STYLES.items():
        ends, _, via = key.partition("~")
        if via and via not in inner:
            continue
        if ends == f"{a}>{b}":
            return value, False
        if ends == f"{b}>{a}":
            return value, True
    return None, False

for chain in chains:
    a, b = pos[chain[0]], pos[chain[-1]]
    inner = chain[1:-1]
    style, reverse = chain_style(chain)
    if reverse:
        style = style[::-1] if isinstance(style, list) else {"start": "end", "end": "start"}.get(style, style)
    options = [style] if style else ["mid", "start", "end"]
    best = None
    for opt in options:
        poly = legs(a, b, opt)
        total, at, corners = place_along(poly, len(inner))
        pts = [at(total * (i + 1) / (len(inner) + 1)) for i in range(len(inner))]
        # Pick whichever shape keeps stations closest to where they really are.
        cost = sum(math.dist(p, auto[n]) for p, n in zip(pts, inner)) + (0.01 if opt != "mid" else 0)
        if best is None or cost < best[0]:
            best = (cost, poly)
    poly = best[1]
    total, at, corners = place_along(poly, len(inner))
    step = total / (len(inner) + 1)
    arcs = [step * (i + 1) for i in range(len(inner))]
    # A station close to a bend moves onto it; other bends get a waypoint.
    free_corners = []
    for c in corners:
        near = min(range(len(arcs)), key=lambda i: abs(arcs[i] - c), default=None)
        if near is not None and abs(arcs[near] - c) < step * 0.35:
            arcs[near] = c
        else:
            free_corners.append(c)
    for n, s in zip(inner, arcs):
        pos[n] = at(s)
    seq = [(0, chain[0])] + list(zip(arcs, inner)) + [(total, chain[-1])]
    for c in free_corners:
        wid = f"w{len(waypoints) + 1}"
        waypoints[wid] = at(c)
        i = max(i for i, (s, _) in enumerate(seq) if s < c)
        u, v = seq[i][1], seq[i + 1][1]
        edge_inserts.setdefault((u, v), []).append(wid)
    spacing_report.append((step, names[chain[0]], names[chain[-1]], len(inner)))

# Thread waypoints into every line path that runs along their edge.
def thread(path):
    out = [path[0]]
    for s, t in zip(path, path[1:]):
        a, b = s.lstrip("~"), t.lstrip("~")
        if (a, b) in edge_inserts:
            out.extend("~" + w for w in edge_inserts[(a, b)])
        elif (b, a) in edge_inserts:
            out.extend("~" + w for w in reversed(edge_inserts[(b, a)]))
        out.append(t)
    return out

line_paths = {r: [thread(p) for p in ps] for r, ps in line_paths.items()}

# --- Report likely problems for tuning the pins ---
for step, an, bn, k in sorted(spacing_report)[:12]:
    if step < 0.8:
        print(f"tight: {an} > {bn}: {k} stations at {step:.2f}")
all_pos = {**{n: pos[n] for n in used}, **waypoints}
label = lambda n: names.get(n, n)
nodes = list(all_pos)
for i, p in enumerate(nodes):
    for q in nodes[i + 1:]:
        if math.dist(all_pos[p], all_pos[q]) < 0.7:
            print(f"close: {label(p)} / {label(q)} ({math.dist(all_pos[p], all_pos[q]):.2f})")

edges = set()
for ps in line_paths.values():
    for p in ps:
        ids = [x.lstrip("~") for x in p]
        edges |= {tuple(sorted(e)) for e in zip(ids, ids[1:])}
edges = sorted(edges)

def seg_dist(p, a, b):
    ax, ay = b[0] - a[0], b[1] - a[1]
    L2 = ax * ax + ay * ay or 1e-9
    t = max(0, min(1, ((p[0] - a[0]) * ax + (p[1] - a[1]) * ay) / L2))
    return math.dist(p, (a[0] + ax * t, a[1] + ay * t))

for u, v in edges:
    a, b = all_pos[u], all_pos[v]
    dx, dy = b[0] - a[0], b[1] - a[1]
    if not (abs(dx) < 1e-6 or abs(dy) < 1e-6 or abs(abs(dx) - abs(dy)) < 1e-6):
        print(f"not octilinear: {label(u)} - {label(v)}")
    for n in nodes:
        if n not in (u, v) and seg_dist(all_pos[n], a, b) < 0.3:
            print(f"on track: {label(n)} sits on {label(u)} - {label(v)}")

def collinear_overlap(e, f):
    a, b = all_pos[e[0]], all_pos[e[1]]
    c, d = all_pos[f[0]], all_pos[f[1]]
    ux, uy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(ux, uy)
    if L < 1e-9:
        return False
    ux, uy = ux / L, uy / L
    for p in (c, d):
        if abs((p[0] - a[0]) * uy - (p[1] - a[1]) * ux) > 0.05:
            return False
    t = sorted(((p[0] - a[0]) * ux + (p[1] - a[1]) * uy) for p in (c, d))
    return min(L, t[1]) - max(0, t[0]) > 0.05

for i, e in enumerate(edges):
    for f in edges[i + 1:]:
        if collinear_overlap(e, f):
            print(f"overlap: {label(e[0])} - {label(e[1])} / {label(f[0])} - {label(f[1])}")

# --- Output ---
def sid(n):
    return n if n.startswith("w") else f"s{n}"

stations = {}
for n in used:
    stations[sid(n)] = {"name": names[n], "x": round(pos[n][0], 3), "y": round(pos[n][1], 3)}
for w, (x, y) in waypoints.items():
    stations[w] = {"name": "", "x": round(x, 3), "y": round(y, 3)}

lines = []
for route in ROUTES:
    conv = [[("~" + sid(s[1:])) if s.startswith("~") else sid(s) for s in p] for p in line_paths[route]]
    line = {
        "id": route.lower(),
        "name": "S" if route in SHUTTLE_LABELS else route,
        "label": SHUTTLE_LABELS.get(route, f"{route} train"),
        "color": COLORS[route],
        "textColor": "#000000" if route in DARK_TEXT else "#ffffff",
    }
    if len(conv) == 1:
        line["stops"] = conv[0]
    else:
        line["branches"] = conv
    lines.append(line)

with open(out_path, "w") as f:
    f.write("""// New York City Subway, generated from the MTA's GTFS feed and station list
// (web.mta.info/developers) by scripts/build_nyc.py: one node per station
// complex, each service's typical weekday daytime stopping pattern, laid out
// as an octilinear schematic.
//
// Stop ids prefixed "~" are stations a service passes through without
// stopping (express runs), so it's drawn along the same track as the locals.
// Unnamed "w" stations are waypoints where track bends between stations.
(function () {

const STATIONS = {
""")
    for k, v in stations.items():
        f.write(f"  {k}: {json.dumps(v)},\n")
    f.write("};\n\nconst LINES = [\n")
    for line in lines:
        f.write("  " + json.dumps(line) + ",\n")
    f.write("];\n\n")
    f.write("// Separate platforms of one complex, linked by a walking transfer.\n")
    f.write("const TRANSFERS = " + json.dumps([[sid(a), sid(b)] for a, b in transfers]) + ";\n\n")
    f.write("window.MetroSystems = window.MetroSystems || {};\n")
    f.write("window.MetroSystems.nyc = {\n")
    f.write('  name: "N.Y.C. Subway",\n')
    f.write(f'  defaultFrom: "{sid(resolve("Van Cortlandt Park-242 St"))}",\n')
    f.write(f'  defaultTo: "{sid(resolve("Coney Island-Stillwell Av"))}",\n')
    f.write(f"  trackOrder: {json.dumps([r.lower() for r in ROUTES])},\n")
    f.write("  STATIONS,\n  LINES,\n  TRANSFERS,\n};\n\n})();\n")

print(len(used), "stations,", len(waypoints), "waypoints,", len(keys), "junctions,", len(chains), "corridors")
unpinned = sorted(names[k] for k in keys if k not in pins and len(adj[k]) != 1)
print("unpinned junctions:", len(unpinned))
