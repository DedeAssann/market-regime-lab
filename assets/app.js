const COLORS = {
  "Hausse stable": "#38cfa5",
  "Repli haussier": "#80d8a7",
  "Hausse volatile": "#f6c453",
  "Baisse stable": "#ff7183",
  "Rebond baissier": "#d8899b",
  "Choc baissier": "#e74b64",
  "Range calme": "#6ca9ff",
  "Indéterminé": "#8d79b8"
};

let market = null;
let visibleDays = 180;
let stateMode = window.matchMedia("(max-width: 720px)").matches ? "2d" : "3d";
const tooltip = document.getElementById("tooltip");

const svgEl = (name, attrs = {}) => {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  return el;
};

const extent = (values) => [Math.min(...values), Math.max(...values)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fmtDate = (iso) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit" }).format(new Date(iso));

function scale(domain, range) {
  const [d0, d1] = domain, [r0, r1] = range;
  return (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
}

function pathFrom(data, x, y, value) {
  return data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(value(d)).toFixed(2)}`).join(" ");
}

function volatilityColor(p) {
  if (p < 33) return "#6ca9ff";
  if (p < 70) return "#f6c453";
  return "#ff7183";
}

function currentSlice() {
  if (!market) return [];
  const bars = Math.round(visibleDays * 6); // six H4 bars per day
  return market.candles.slice(-bars);
}

function updateSummary() {
  const d = market.candles.at(-1);
  document.getElementById("regime-name").textContent = d.regime;
  document.getElementById("regime-name").style.color = COLORS[d.regime];
  document.getElementById("regime-note").textContent = `Bougie clôturée · ${fmtDate(d.time)}`;
  document.getElementById("confidence").textContent = `${Math.round(d.confidence)} %`;
  document.getElementById("confidence-ring").style.setProperty("--score", `${d.confidence}%`);
  document.getElementById("confidence-ring").style.background = `conic-gradient(${COLORS[d.regime]} ${d.confidence}%, #263342 0)`;
  const slopeLabel = d.slope_atr > .03 ? "Positive" : d.slope_atr < -.03 ? "Négative" : "Neutre";
  document.getElementById("trend-value").textContent = slopeLabel;
  document.getElementById("trend-detail").textContent = `${d.slope_atr >= 0 ? "+" : ""}${d.slope_atr.toFixed(3)} ATR/bar`;
  document.getElementById("rsi-value").textContent = d.rsi.toFixed(1);
  document.getElementById("atr-value").textContent = `${Math.round(d.atr_percentile)}e`;
  document.getElementById("atr-detail").textContent = `percentile · ATR ${(d.atr * 10000).toFixed(1)} pips`;
  document.getElementById("freshness").innerHTML = `<span class="status-dot" style="background:${market.demo ? "var(--amber)" : "var(--mint)"}"></span>${market.demo ? "Données de démonstration" : "Données actualisées"} · ${fmtDate(market.generated_at)}`;

  const reasons = [
    `Le prix est ${d.close >= d.ema50 ? "au-dessus" : "en dessous"} de l’EMA 50 (${d.close.toFixed(5)} contre ${d.ema50.toFixed(5)}).`,
    `La pente normalisée vaut ${d.slope_atr >= 0 ? "+" : ""}${d.slope_atr.toFixed(3)} ATR par bougie : tendance ${slopeLabel.toLowerCase()}.`,
    `Le RSI est à ${d.rsi.toFixed(1)}, avec une volatilité au ${Math.round(d.atr_percentile)}e percentile.`,
    d.confidence < 60 ? "Les facteurs sont encore contradictoires : le système privilégie l’abstention." : "Les trois facteurs sont suffisamment cohérents pour caractériser le régime."
  ];
  document.getElementById("decision-list").innerHTML = reasons.map(r => `<li>${r}</li>`).join("");
}

function baseChart(container, margins = { top: 10, right: 14, bottom: 30, left: 54 }) {
  container.innerHTML = "";
  const width = Math.max(container.clientWidth, 300);
  const height = container.clientHeight;
  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: "none" });
  container.appendChild(svg);
  return { svg, width, height, margins, plotW: width - margins.left - margins.right, plotH: height - margins.top - margins.bottom };
}

function drawPrice() {
  const data = currentSlice().filter(d => Number.isFinite(d.ema50));
  const c = baseChart(document.getElementById("price-chart"));
  const { svg, width, height, margins: m, plotW, plotH } = c;
  const [rawMin, rawMax] = extent(data.flatMap(d => [d.low, d.high, d.ema50]));
  const pad = (rawMax - rawMin) * .08;
  const y = scale([rawMin - pad, rawMax + pad], [m.top + plotH, m.top]);
  const x = scale([0, data.length - 1], [m.left, m.left + plotW]);

  let start = 0;
  for (let i = 1; i <= data.length; i++) {
    if (i === data.length || data[i].regime !== data[start].regime) {
      svg.appendChild(svgEl("rect", { x: x(start), y: m.top, width: Math.max(1, x(i - 1) - x(start) + plotW / data.length), height: plotH, fill: COLORS[data[start].regime], opacity: .065 }));
      start = i;
    }
  }

  for (let i = 0; i <= 4; i++) {
    const yy = m.top + plotH * i / 4;
    svg.appendChild(svgEl("line", { x1: m.left, x2: width - m.right, y1: yy, y2: yy, class: "grid-line" }));
    const value = rawMax + pad - (rawMax - rawMin + 2 * pad) * i / 4;
    const label = svgEl("text", { x: m.left - 8, y: yy + 4, "text-anchor": "end" }); label.textContent = value.toFixed(4); svg.appendChild(label);
  }
  for (let i = 0; i <= 4; i++) {
    const idx = Math.round((data.length - 1) * i / 4);
    const xx = x(idx);
    svg.appendChild(svgEl("line", { x1: xx, x2: xx, y1: m.top, y2: m.top + plotH, class: "grid-line" }));
    const label = svgEl("text", { x: xx, y: height - 7, "text-anchor": i === 0 ? "start" : i === 4 ? "end" : "middle" });
    label.textContent = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" }).format(new Date(data[idx].time)); svg.appendChild(label);
  }
  svg.appendChild(svgEl("path", { d: pathFrom(data, x, y, d => d.close), class: "price-path" }));
  svg.appendChild(svgEl("path", { d: pathFrom(data, x, y, d => d.ema50), class: "ema-path" }));

  const hover = svgEl("line", { y1: m.top, y2: m.top + plotH, class: "hover-line", visibility: "hidden" }); svg.appendChild(hover);
  const overlay = svgEl("rect", { x: m.left, y: m.top, width: plotW, height: plotH, fill: "transparent" });
  overlay.addEventListener("pointermove", (e) => {
    const r = svg.getBoundingClientRect();
    const px = (e.clientX - r.left) * width / r.width;
    const idx = clamp(Math.round((px - m.left) / plotW * (data.length - 1)), 0, data.length - 1);
    const d = data[idx]; hover.setAttribute("x1", x(idx)); hover.setAttribute("x2", x(idx)); hover.setAttribute("visibility", "visible");
    tooltip.hidden = false; tooltip.style.left = `${Math.min(e.clientX + 14, innerWidth - 190)}px`; tooltip.style.top = `${Math.max(8, e.clientY - 80)}px`;
    tooltip.innerHTML = `<strong>${fmtDate(d.time)}</strong><span>Prix</span> ${d.close.toFixed(5)}<br><span>EMA 50</span> ${d.ema50.toFixed(5)}<br><span>Régime</span> ${d.regime}`;
  });
  overlay.addEventListener("pointerleave", () => { hover.setAttribute("visibility", "hidden"); tooltip.hidden = true; });
  svg.appendChild(overlay);

  const strip = document.getElementById("regime-strip"); strip.innerHTML = "";
  data.forEach(d => { const s = document.createElement("span"); s.style.flex = "1"; s.style.background = COLORS[d.regime]; strip.appendChild(s); });
}

function stateData() {
  const source = currentSlice().filter(d => Number.isFinite(d.slope_atr) && Number.isFinite(d.rsi));
  return { source, data: source.slice(-90) };
}

function drawState2D() {
  const { source, data } = stateData();
  const c = baseChart(document.getElementById("state-chart"), { top: 12, right: 18, bottom: 32, left: 48 });
  const { svg, width, height, margins: m, plotW, plotH } = c;
  const maxAbs = Math.max(.12, ...source.map(d => Math.abs(d.slope_atr))) * 1.08;
  const x = scale([-maxAbs, maxAbs], [m.left, m.left + plotW]);
  const y = scale([20, 80], [m.top + plotH, m.top]);
  [20, 40, 60, 80].forEach(v => {
    const yy = y(v); svg.appendChild(svgEl("line", { x1: m.left, x2: width - m.right, y1: yy, y2: yy, class: "grid-line" }));
    const t = svgEl("text", { x: m.left - 8, y: yy + 4, "text-anchor": "end" }); t.textContent = v; svg.appendChild(t);
  });
  [-1, -.5, 0, .5, 1].forEach(f => {
    const v = maxAbs * f, xx = x(v); svg.appendChild(svgEl("line", { x1: xx, x2: xx, y1: m.top, y2: m.top + plotH, class: f === 0 ? "axis-line" : "grid-line" }));
    const t = svgEl("text", { x: xx, y: height - 7, "text-anchor": "middle" }); t.textContent = v.toFixed(2); svg.appendChild(t);
  });
  svg.appendChild(svgEl("path", { d: data.map((d, i) => `${i ? "L" : "M"}${x(d.slope_atr)},${y(clamp(d.rsi,20,80))}`).join(" "), class: "state-path" }));
  data.forEach((d, i) => {
    const p = svgEl("circle", { cx: x(d.slope_atr), cy: y(clamp(d.rsi,20,80)), r: i === data.length - 1 ? 7 : 3.2, fill: volatilityColor(d.atr_percentile), opacity: i === data.length - 1 ? 1 : .48, class: `point ${i === data.length - 1 ? "current" : ""}` });
    p.addEventListener("pointerenter", (e) => { tooltip.hidden = false; tooltip.style.left = `${Math.min(e.clientX + 12, innerWidth - 190)}px`; tooltip.style.top = `${Math.max(8, e.clientY - 80)}px`; tooltip.innerHTML = `<strong>${fmtDate(d.time)}</strong><span>Pente</span> ${d.slope_atr.toFixed(3)} ATR<br><span>RSI</span> ${d.rsi.toFixed(1)}<br><span>Volatilité</span> ${Math.round(d.atr_percentile)}e pct.`; });
    p.addEventListener("pointerleave", () => tooltip.hidden = true); svg.appendChild(p);
  });
}

function drawState3D() {
  if (typeof Plotly === "undefined") {
    stateMode = "2d";
    syncStateControls();
    drawState2D();
    return;
  }
  const { data } = stateData();
  const container = document.getElementById("state-chart");
  container.innerHTML = "";
  const zValues = data.map(d => (d.close - d.ema50) / d.atr);
  const commonHover = data.map(d => [fmtDate(d.time), d.regime, d.atr_percentile]);
  const trajectory = {
    type: "scatter3d",
    mode: "lines+markers",
    x: data.map(d => d.slope_atr),
    y: data.map(d => d.rsi),
    z: zValues,
    customdata: commonHover,
    line: { color: "rgba(234,242,247,.32)", width: 3 },
    marker: {
      size: 3.2,
      color: data.map(d => d.atr_percentile),
      cmin: 0, cmax: 100,
      colorscale: [[0,"#6ca9ff"],[.5,"#f6c453"],[1,"#ff7183"]],
      opacity: .72,
      showscale: false
    },
    hovertemplate: "<b>%{customdata[0]}</b><br>Pente : %{x:.3f} ATR/bar<br>RSI : %{y:.1f}<br>Distance : %{z:.2f} ATR<br>Volatilité : %{customdata[2]:.0f}e pct.<br>Régime : %{customdata[1]}<extra></extra>",
    name: "Trajectoire"
  };
  const current = data.at(-1);
  const currentTrace = {
    type: "scatter3d",
    mode: "markers",
    x: [current.slope_atr], y: [current.rsi], z: [(current.close - current.ema50) / current.atr],
    customdata: [[fmtDate(current.time), current.regime, current.atr_percentile]],
    marker: { size: 8, color: volatilityColor(current.atr_percentile), line: { color: "#eaf2f7", width: 3 }, opacity: 1 },
    hovertemplate: "<b>État actuel</b><br>%{customdata[0]}<br>Pente : %{x:.3f} ATR/bar<br>RSI : %{y:.1f}<br>Distance : %{z:.2f} ATR<br>Régime : %{customdata[1]}<extra></extra>",
    name: "État actuel"
  };
  const axis = (title) => ({ title: { text: title, font: { size: 11, color: "#8fa1b2" } }, color: "#8fa1b2", gridcolor: "rgba(143,161,178,.16)", zerolinecolor: "rgba(143,161,178,.34)", backgroundcolor: "rgba(8,13,19,.18)", showbackground: true, tickfont: { size: 10 } });
  Plotly.newPlot(container, [trajectory, currentTrace], {
    margin: { l: 0, r: 0, t: 0, b: 0 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    showlegend: false,
    scene: {
      xaxis: axis("Pente EMA / ATR"),
      yaxis: axis("RSI 14"),
      zaxis: axis("Distance prix–EMA / ATR"),
      camera: { eye: { x: 1.55, y: 1.45, z: 1.08 } },
      aspectmode: "cube"
    },
    font: { family: "Inter, system-ui, sans-serif", color: "#8fa1b2" },
    hoverlabel: { bgcolor: "#172230", bordercolor: "#344557", font: { color: "#eaf2f7", size: 12 } }
  }, { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["toImage", "sendDataToCloud", "lasso3d", "select2d"] });
}

function syncStateControls() {
  document.querySelectorAll("[data-state-mode]").forEach(button => {
    const active = button.dataset.stateMode === stateMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  document.getElementById("axis-help").hidden = stateMode === "3d";
}

function drawState() {
  const container = document.getElementById("state-chart");
  if (typeof Plotly !== "undefined") Plotly.purge(container);
  syncStateControls();
  if (stateMode === "3d") drawState3D(); else drawState2D();
}

function render() { updateSummary(); drawPrice(); drawState(); }

document.querySelectorAll("[data-range]").forEach(button => button.addEventListener("click", () => {
  visibleDays = Number(button.dataset.range);
  document.querySelectorAll("[data-range]").forEach(b => { b.classList.toggle("active", b === button); b.setAttribute("aria-pressed", b === button ? "true" : "false"); });
  drawPrice(); drawState();
}));

document.querySelectorAll("[data-state-mode]").forEach(button => button.addEventListener("click", () => {
  stateMode = button.dataset.stateMode;
  drawState();
}));

fetch("data/market.json", { cache: "no-store" })
  .then(r => { if (!r.ok) throw new Error("Données indisponibles"); return r.json(); })
  .then(data => { market = data; render(); })
  .catch(err => { document.getElementById("freshness").textContent = err.message; });

let resizeTimer;
addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => market && render(), 120); });
