(function () {
const { STATIONS, LINES, SYSTEMS, systemId, name: systemName, defaultFrom, defaultTo } = window.MetroData;
const { UNIT, STATION_LINES, draw, worldToScreen, screenToWorld, findStationAt, stationScreenPos } = window.MetroRender;
const { ALGORITHMS, findRoute, buildRoutePath, rideHops, transferCount } = window.MetroRoute;

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const legendEl = document.getElementById("legend");
const tooltipEl = document.getElementById("tooltip");
const fromSelect = document.getElementById("from-select");
const toSelect = document.getElementById("to-select");
const algorithmSelect = document.getElementById("algorithm-select");
const rideBtn = document.getElementById("ride-btn");
const clearBtn = document.getElementById("clear-btn");
const statusEl = document.getElementById("journey-status");
const citySelect = document.getElementById("city-select");

const JOURNEY_SPEED = 120; // world px/sec (independent of zoom, like real travel time)
// Search replay pacing: seconds per station reached, capped so long searches
// speed up instead of dragging on.
const SEARCH_STEP = 0.12;
const MAX_SEARCH_DURATION = 5;
const FOUND_DURATION = 0.9;

let dpr = Math.max(1, window.devicePixelRatio || 1);
let width = 0;
let height = 0;
let lastFrameTime = 0;

const view = { scale: 1, offsetX: 0, offsetY: 0 };

const ui = {
  hiddenLines: new Set(),
  hoveredStation: null,
  journey: null,
};

// Which end the next canvas click fills in.
let picking = "from";

function resize() {
  dpr = Math.max(1, window.devicePixelRatio || 1);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function fitToScreen() {
  const xs = Object.values(STATIONS).map((s) => s.x);
  const ys = Object.values(STATIONS).map((s) => s.y);
  const minX = Math.min(...xs) * UNIT;
  const maxX = Math.max(...xs) * UNIT;
  const minY = Math.min(...ys) * UNIT;
  const maxY = Math.max(...ys) * UNIT;
  const mapWidth = maxX - minX;
  const mapHeight = maxY - minY;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  // On phones the journey panel covers the bottom of the screen, so center the
  // map in the space above it and zoom past a full fit (edges may be cut off).
  if (window.matchMedia("(max-width: 600px)").matches) {
    const top = document.getElementById("header").getBoundingClientRect().bottom;
    const bottom = document.getElementById("journey-panel").getBoundingClientRect().top;
    const areaHeight = bottom - top;
    const fit = Math.min(width / mapWidth, areaHeight / mapHeight);
    view.scale = clampScale(fit * 1.35);
    view.offsetX = width / 2 - centerX * view.scale;
    view.offsetY = top + areaHeight / 2 - centerY * view.scale;
    return;
  }

  const padding = 120;
  const scaleX = (width - padding * 2) / mapWidth;
  const scaleY = (height - padding * 2) / mapHeight;
  view.scale = Math.min(scaleX, scaleY, 1.1);
  view.offsetX = width / 2 - centerX * view.scale;
  view.offsetY = height / 2 - centerY * view.scale;
}

function clampScale(s) {
  return Math.min(3.5, Math.max(0.25, s));
}

function zoomAt(screenX, screenY, factor) {
  const before = screenToWorld(view, screenX, screenY);
  view.scale = clampScale(view.scale * factor);
  const after = worldToScreen(view, before.x, before.y);
  view.offsetX += screenX - after.x;
  view.offsetY += screenY - after.y;
}

// --- City picker (the page heading) ---
// Each city is its own page load (?city=...), since every module derives its
// lookup tables from the chosen system's data once at startup.
function setupCityPicker() {
  document.title = systemName;
  citySelect.innerHTML = SYSTEMS.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
  citySelect.value = systemId;
  fitSelectToText(citySelect);
  citySelect.addEventListener("change", () => {
    const url = new URL(window.location.href);
    url.searchParams.set("city", citySelect.value);
    window.location.href = url.toString();
  });
}

// A <select> is as wide as its longest option; size it to the chosen one so
// the chevron sits right after the heading text.
function fitSelectToText(select) {
  const style = getComputedStyle(select);
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const text = select.selectedOptions[0].text;
  const letterSpacing = parseFloat(style.letterSpacing) || 0;
  const textWidth = measure.measureText(text).width + letterSpacing * text.length;
  const chrome = ["paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth"].reduce((sum, k) => sum + parseFloat(style[k]), 0);
  select.style.width = `${Math.ceil(textWidth + chrome)}px`;
}

// --- Route picker ---
// Waypoints (where track bends between stations) are served by no line.
const SORTED_STATION_IDS = Object.keys(STATIONS).filter((id) => STATION_LINES[id].length > 0).sort(
  (a, b) => STATIONS[a].name.localeCompare(STATIONS[b].name, undefined, { numeric: true }) || lineNames(a).localeCompare(lineNames(b))
);

// Names shared by several stations (NYC has five "86 St"s) get their lines
// added in the dropdowns so they can be told apart.
const NAME_COUNTS = {};
for (const s of Object.values(STATIONS)) NAME_COUNTS[s.name] = (NAME_COUNTS[s.name] || 0) + 1;

function lineNames(id) {
  return [...new Set(STATION_LINES[id].map((lid) => LINES.find((l) => l.id === lid).name))].join(" ");
}

function optionLabel(id) {
  const name = STATIONS[id].name;
  return NAME_COUNTS[name] > 1 ? `${name} (${lineNames(id)})` : name;
}

function populateSelects() {
  for (const select of [fromSelect, toSelect]) {
    select.innerHTML = SORTED_STATION_IDS.map((id) => `<option value="${id}">${optionLabel(id)}</option>`).join("");
  }
  fromSelect.value = defaultFrom;
  toSelect.value = defaultTo;
  algorithmSelect.innerHTML = ALGORITHMS.map((a) => `<option value="${a.id}">${a.name}</option>`).join("");
}

function algorithmName(id) {
  return ALGORITHMS.find((a) => a.id === id).name;
}

function startJourney(startId, endId) {
  const algorithm = algorithmSelect.value;
  const result = findRoute(startId, endId, algorithm);
  if (!result) {
    ui.journey = null;
    clearBtn.hidden = true;
    statusEl.textContent = "Pick two different stations to start a trip.";
    return;
  }
  const path = buildRoutePath(result.hops);
  ui.journey = {
    path,
    explored: result.explored,
    algorithm,
    startId,
    endId,
    startTime: lastFrameTime,
    searchDuration: Math.min(MAX_SEARCH_DURATION, Math.max(0.6, result.explored.length * SEARCH_STEP)),
    foundDuration: FOUND_DURATION,
    duration: Math.max(1.5, path.total / JOURNEY_SPEED),
  };
  clearBtn.hidden = false;
}

function clearJourney() {
  ui.journey = null;
  clearBtn.hidden = true;
  picking = "from";
  statusEl.textContent = "Pick a start and destination, or click two stations on the map.";
}

function updateStatus(state) {
  const journey = ui.journey;
  if (!journey) return;
  const checked = journey.explored.length;
  if (state.phase === "search") {
    statusEl.textContent = `${algorithmName(journey.algorithm)}: searching for ${STATIONS[journey.endId].name}… ${state.visitedCount} stations checked`;
    return;
  }
  if (state.phase === "found") {
    statusEl.textContent = `Found ${STATIONS[journey.endId].name} after checking ${checked} stations`;
    return;
  }
  const t = state.t;
  const stops = rideHops(journey.path.hops).length;
  const transfers = transferCount(journey.path.hops);
  const from = STATIONS[journey.startId].name;
  const to = STATIONS[journey.endId].name;
  const transferText = transfers > 0 ? ` · ${transfers} transfer${transfers > 1 ? "s" : ""}` : " · direct";
  if (t >= 1) {
    statusEl.textContent = `Arrived at ${to} · ${stops} stops${transferText} · ${checked} stations searched`;
  } else {
    statusEl.textContent = `${from} → ${to} · ${stops} stops${transferText} · ${Math.round(t * 100)}% en route`;
  }
}

rideBtn.addEventListener("click", () => {
  startJourney(fromSelect.value, toSelect.value);
});

clearBtn.addEventListener("click", clearJourney);

// Switching algorithms mid-trip replays the same trip with the new search.
algorithmSelect.addEventListener("change", () => {
  if (ui.journey) startJourney(ui.journey.startId, ui.journey.endId);
});

function handleStationClick(id) {
  if (!id) return;
  if (picking === "from") {
    fromSelect.value = id;
    picking = "to";
    ui.journey = null;
    clearBtn.hidden = true;
    statusEl.textContent = `Start: ${STATIONS[id].name} — now click a destination.`;
  } else {
    if (id === fromSelect.value) return;
    toSelect.value = id;
    picking = "from";
    startJourney(fromSelect.value, id);
  }
}

// --- Panning (mouse) ---
let isPanning = false;
let lastX = 0;
let lastY = 0;
let didDrag = false;

canvas.addEventListener("mousedown", (e) => {
  isPanning = true;
  didDrag = false;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.classList.add("grabbing");
});

window.addEventListener("mousemove", (e) => {
  if (isPanning) {
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDrag = true;
    view.offsetX += dx;
    view.offsetY += dy;
    lastX = e.clientX;
    lastY = e.clientY;
    return;
  }
  handleHover(e.clientX, e.clientY);
});

window.addEventListener("mouseup", () => {
  isPanning = false;
  canvas.classList.remove("grabbing");
});

canvas.addEventListener("click", (e) => {
  if (didDrag) return;
  handleStationClick(findStationAt(view, e.clientX, e.clientY));
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const factor = Math.exp(-e.deltaY * 0.0015);
  zoomAt(e.clientX, e.clientY, factor);
}, { passive: false });

// --- Panning / pinch (touch) ---
let lastTouchDist = null;
let lastTouchMid = null;

canvas.addEventListener("touchstart", (e) => {
  if (e.touches.length === 1) {
    isPanning = true;
    didDrag = false;
    lastX = e.touches[0].clientX;
    lastY = e.touches[0].clientY;
  } else if (e.touches.length === 2) {
    isPanning = false;
    lastTouchDist = touchDistance(e.touches);
    lastTouchMid = touchMidpoint(e.touches);
  }
}, { passive: true });

canvas.addEventListener("touchmove", (e) => {
  if (e.touches.length === 1 && isPanning) {
    const dx = e.touches[0].clientX - lastX;
    const dy = e.touches[0].clientY - lastY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDrag = true;
    view.offsetX += dx;
    view.offsetY += dy;
    lastX = e.touches[0].clientX;
    lastY = e.touches[0].clientY;
  } else if (e.touches.length === 2) {
    const dist = touchDistance(e.touches);
    const mid = touchMidpoint(e.touches);
    if (lastTouchDist) zoomAt(mid.x, mid.y, dist / lastTouchDist);
    lastTouchDist = dist;
    lastTouchMid = mid;
  }
}, { passive: true });

canvas.addEventListener("touchend", (e) => {
  if (e.touches.length === 0) {
    if (!didDrag && lastX && lastY) {
      handleStationClick(findStationAt(view, lastX, lastY));
    }
    isPanning = false;
    lastTouchDist = null;
  }
});

function touchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function touchMidpoint(touches) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  };
}

// --- Hover tooltip ---
function handleHover(x, y) {
  const id = findStationAt(view, x, y);
  ui.hoveredStation = id;
  canvas.style.cursor = id ? "pointer" : "grab";
  if (!id) {
    tooltipEl.hidden = true;
    return;
  }
  const s = STATIONS[id];
  const lines = STATION_LINES[id];
  tooltipEl.innerHTML = `
    <div class="tooltip-title">${s.name}</div>
    <div class="tooltip-lines">
      ${lines.map((lid) => lineBadge(LINES.find((l) => l.id === lid), "tooltip-dot")).join("")}
    </div>
  `;
  const pos = stationScreenPos(view, id);
  tooltipEl.style.left = `${pos.x}px`;
  tooltipEl.style.top = `${pos.y}px`;
  tooltipEl.hidden = false;
}

// A line's colored marker. Lines with a letter/number name (NYC's services)
// get it printed in a round bullet, as on the MTA map, since several share a color.
function lineBadge(line, className) {
  if (!line.textColor) return `<span class="${className}" style="background:${line.color}"></span>`;
  return `<span class="${className} bullet" style="background:${line.color};color:${line.textColor}">${line.name}</span>`;
}

// --- Legend ---
function renderLegend() {
  legendEl.innerHTML = "";
  for (const line of LINES) {
    const item = document.createElement("div");
    item.className = "legend-item" + (ui.hiddenLines.has(line.id) ? " dimmed" : "");
    item.innerHTML = `${lineBadge(line, "legend-swatch")}<span>${line.label || `${line.name} Line`}</span>`;
    item.addEventListener("click", () => {
      if (ui.hiddenLines.has(line.id)) ui.hiddenLines.delete(line.id);
      else ui.hiddenLines.add(line.id);
      renderLegend();
    });
    legendEl.appendChild(item);
  }
}

// --- Animation loop ---
function frame(t) {
  lastFrameTime = t / 1000;
  const journeyState = draw(ctx, width, height, view, lastFrameTime, ui);
  if (journeyState) updateStatus(journeyState);
  requestAnimationFrame(frame);
}

window.addEventListener("resize", () => {
  const prevWidth = width || window.innerWidth;
  const prevHeight = height || window.innerHeight;
  resize();
  view.offsetX += (width - prevWidth) / 2;
  view.offsetY += (height - prevHeight) / 2;
});

resize();
setupCityPicker();
populateSelects();
renderLegend();
clearJourney();
// After the panel is filled in, so its measured height is final.
fitToScreen();
requestAnimationFrame(frame);

})();
