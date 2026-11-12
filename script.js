/* ============================================================
   Pavement Condition Dashboard
   Data source: EFAP_PCI.geojson  (place it in the same folder,
   or update GEOJSON_PATH below)
   ============================================================ */

const GEOJSON_PATH = "EFAP_PCI.geojson";

/* ---------------------------------------------------------------
   Simplified 4-color display scheme (used for map lines, the
   right-hand legend, and the pie chart):

     Good / Satisfactory  -> Green
     Fair                 -> Yellow
     Poor / Very Poor /
     Serious / Failed     -> Red
     Any "Gatch" (kutcha / unpaved) surface -> Blue, regardless
     of its PCI_RATING (unpaved roads are flagged separately,
     not scored on the same paved-road PCI scale).
   --------------------------------------------------------------- */
const BUCKET_ORDER = ["Good", "Fair", "Poor", "Gatch Road"];
const BUCKET_COLORS = {
  "Good": "#2e7d32",
  "Fair": "#ffeb3b",
  "Poor": "#d32f2f",
  "Gatch Road": "#1565c0"
};

/* Basemap options for the "Basemap" filter */
const BASEMAPS = {
  light: { url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", attribution: "&copy; OpenStreetMap &copy; CARTO" },
  dark: { url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", attribution: "&copy; OpenStreetMap &copy; CARTO" },
  streets: { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "&copy; OpenStreetMap contributors" },
  satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attribution: "Tiles &copy; Esri" },
  terrain: { url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", attribution: "&copy; OpenTopoMap contributors" }
};

let rawGeojson = null;   // full dataset as loaded
let geoLayer = null;     // current leaflet layer on the map
let map = null;
let tileLayer = null;
let pieChart = null;
let roadClassChart = null;
let surfaceTypeChart = null;

if (window.ChartDataLabels) {
  Chart.register(ChartDataLabels);
}

document.addEventListener("DOMContentLoaded", init);

async function init() {
  initMap();

  try {
    const res = await fetch(GEOJSON_PATH);
    if (!res.ok) throw new Error("HTTP " + res.status);
    rawGeojson = await res.json();
  } catch (err) {
    console.error("Could not load " + GEOJSON_PATH, err);
    alert(
      "Could not load '" + GEOJSON_PATH + "'.\n" +
      "Make sure the file sits next to index.html, and that you're viewing this " +
      "page through a local server (e.g. VS Code 'Live Server'), not a plain file:// path."
    );
    return;
  }

  populateFilterOptions(rawGeojson.features);
  renderAll(rawGeojson.features);
  attachFilterEvents();
}

function initMap() {
  map = L.map("map", { zoomControl: true }).setView([26.5, 68.5], 7); // roughly Sindh, Pakistan
  setBasemap("light");

  document.getElementById("basemapFilter").addEventListener("change", e => {
    setBasemap(e.target.value);
  });
}

function setBasemap(key) {
  const b = BASEMAPS[key] || BASEMAPS.light;
  if (tileLayer) map.removeLayer(tileLayer);
  tileLayer = L.tileLayer(b.url, { attribution: b.attribution, maxZoom: 19 }).addTo(map);
  tileLayer.bringToBack();
}

/* ---------- helpers to read properties safely ---------- */
function prop(feature, key, fallback = "Unknown") {
  const v = feature.properties ? feature.properties[key] : undefined;
  return (v === null || v === undefined || v === "") ? fallback : v;
}
function num(feature, key, fallback = 0) {
  const v = feature.properties ? feature.properties[key] : undefined;
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

/* ---------- 4-bucket classification used everywhere ----------
   Matching is case-insensitive and trimmed, since source data can
   contain values like "good", "GOOD", " Good " etc. If PCI_RATING
   text doesn't match any known category, we fall back to the
   numeric PCI_VALUE using standard PCI break points, so every
   feature always resolves into one of the 4 buckets. */
function getBucket(feature) {
  const surface = (prop(feature, "ROAD_SURFACE_TYPE", "") + "").trim().toLowerCase();
  if (surface.includes("gatch")) return "Gatch Road";

  const rating = (prop(feature, "PCI_RATING", "") + "").trim().toLowerCase();

  if (rating.includes("good") || rating.includes("satisfactory")) return "Good";
  if (rating.includes("fair")) return "Fair";
  if (rating.includes("poor") || rating.includes("serious") || rating.includes("fail")) return "Poor";

  // Rating text unrecognised/blank -> fall back to PCI_VALUE
  const pci = num(feature, "PCI_VALUE", NaN);
  if (!isNaN(pci)) {
    if (pci >= 70) return "Good";
    if (pci >= 40) return "Fair";
    return "Poor";
  }

  return "Poor";
}
function bucketColor(bucket) {
  return BUCKET_COLORS[bucket] || "#9e9e9e";
}

/* ---------- populate dropdown filters from data ---------- */
function populateFilterOptions(features) {
  const districts = new Set();
  const roads = new Set();
  let minWidth = Infinity, maxWidth = -Infinity;

  features.forEach(f => {
    districts.add(prop(f, "DISTRICT"));
    roads.add(prop(f, "ROAD_NAME"));
    const w = num(f, "CARRIAGEWAY_WIDTH", NaN);
    if (!isNaN(w)) {
      if (w < minWidth) minWidth = w;
      if (w > maxWidth) maxWidth = w;
    }
  });

  if (!isFinite(minWidth)) { minWidth = 0; maxWidth = 0; }

  fillSelect("districtFilter", [...districts].sort(), "No category selected");
  fillSelect("roadFilter", [...roads].sort(), "No category selected");

  const widthSlider = document.getElementById("widthSlider");
  widthSlider.min = minWidth;
  widthSlider.max = maxWidth;
  widthSlider.value = minWidth;
  document.getElementById("widthSliderValue").textContent =
    `${minWidth.toFixed(1)} – ${maxWidth.toFixed(1)}`;
}

function fillSelect(id, values, placeholder) {
  const sel = document.getElementById(id);
  sel.innerHTML = `<option value="">${placeholder}</option>`;
  values.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  });
}

/* ---------- filtering ---------- */
function getFilteredFeatures() {
  const district = document.getElementById("districtFilter").value;
  const road = document.getElementById("roadFilter").value;
  const minPci = parseFloat(document.getElementById("pciSlider").value) || 0;
  const minWidth = parseFloat(document.getElementById("widthSlider").value) || 0;

  return rawGeojson.features.filter(f => {
    if (district && prop(f, "DISTRICT") !== district) return false;
    if (road && prop(f, "ROAD_NAME") !== road) return false;
    if (num(f, "PCI_VALUE") < minPci) return false;
    if (num(f, "CARRIAGEWAY_WIDTH") < minWidth) return false;
    return true;
  });
}

function attachFilterEvents() {
  ["districtFilter", "roadFilter"].forEach(id => {
    document.getElementById(id).addEventListener("change", () => renderAll(getFilteredFeatures()));
  });

  const pciSlider = document.getElementById("pciSlider");
  pciSlider.addEventListener("input", () => {
    document.getElementById("pciSliderValue").textContent = pciSlider.value + " – 100";
    renderAll(getFilteredFeatures());
  });

  const widthSlider = document.getElementById("widthSlider");
  widthSlider.addEventListener("input", () => {
    document.getElementById("widthSliderValue").textContent =
      `${parseFloat(widthSlider.value).toFixed(1)} – ${parseFloat(widthSlider.max).toFixed(1)}`;
    renderAll(getFilteredFeatures());
  });

  document.getElementById("resetBtn").addEventListener("click", resetFilters);
}

/* ---------- master render ---------- */
function renderAll(features) {
  renderMap(features);
  renderKpi(features);
  renderLegendAndPie(features);
  renderRoadClassChart(features);
  renderSurfaceTypeChart(features);
}

/* ---------- map layer ---------- */
function renderMap(features) {
  if (geoLayer) {
    map.removeLayer(geoLayer);
  }

  geoLayer = L.geoJSON({ type: "FeatureCollection", features }, {
    style: feature => ({
      color: bucketColor(getBucket(feature)),
      weight: 3,
      opacity: 0.9
    }),
    onEachFeature: (feature, layer) => {
      const bucket = getBucket(feature);
      layer.bindPopup(`
        <strong>${prop(feature, "ROAD_NAME")}</strong><br/>
        District: ${prop(feature, "DISTRICT")}<br/>
        Section: ${prop(feature, "SECTION_NUMBER")}<br/>
        Classification: ${prop(feature, "ROAD_CLASSIFICATION")}<br/>
        Surface: ${prop(feature, "ROAD_SURFACE_TYPE")}<br/>
        Carriageway Width: ${prop(feature, "CARRIAGEWAY_WIDTH")}<br/>
        PCI Value: ${prop(feature, "PCI_VALUE")}<br/>
        PCI Rating: ${prop(feature, "PCI_RATING")}<br/>
        Map Color: <span style="color:${bucketColor(bucket)}">${bucket}</span><br/>
        Length: ${num(feature, "Length_km").toFixed(2)} km
      `);
    }
  }).addTo(map);

  if (features.length) {
    try { map.fitBounds(geoLayer.getBounds(), { padding: [20, 20] }); } catch (e) {}
  }
}

/* ---------- KPI card ---------- */
function renderKpi(features) {
  const totalKm = features.reduce((sum, f) => sum + num(f, "Length_km"), 0);
  document.getElementById("totalLength").textContent =
    totalKm.toLocaleString(undefined, { maximumFractionDigits: 1 }) + " km";
}

/* ---------- Legend + pie chart (4-bucket, length-weighted %) ---------- */
function renderLegendAndPie(features) {
  const totals = {};
  BUCKET_ORDER.forEach(b => totals[b] = 0);

  let grandTotal = 0;
  features.forEach(f => {
    const bucket = getBucket(f);
    const len = num(f, "Length_km");
    totals[bucket] += len;
    grandTotal += len;
  });

  const labels = BUCKET_ORDER;
  const values = labels.map(b => totals[b]);
  const percentages = values.map(v => grandTotal ? (v / grandTotal * 100) : 0);
  const colors = labels.map(bucketColor);

  // legend list
  const legendList = document.getElementById("legendList");
  legendList.innerHTML = "";
  labels.forEach((label, i) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="legend-name">
        <span class="legend-swatch" style="background:${colors[i]}"></span>${label}
      </span>
      <span class="legend-pct">${percentages[i].toFixed(2)}%</span>
    `;
    legendList.appendChild(li);
  });

  // pie chart
  const ctx = document.getElementById("pciPieChart").getContext("2d");
  if (pieChart) pieChart.destroy();
  pieChart = new Chart(ctx, {
    type: "pie",
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 1, borderColor: "#fff" }]
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const pct = grandTotal ? (ctx.parsed / grandTotal * 100).toFixed(2) : 0;
              return `${ctx.label}: ${ctx.parsed.toFixed(1)} km (${pct}%)`;
            }
          }
        },
        datalabels: {
          color: "#1a1a1a",
          font: { weight: "bold", size: 11 },
          formatter: (value) => {
            const pct = grandTotal ? (value / grandTotal * 100) : 0;
            return pct >= 1 ? pct.toFixed(1) + "%" : "";
          }
        }
      }
    }
  });
}

/* ---------- Road classification bar chart (by length km) ---------- */
function renderRoadClassChart(features) {
  const totals = {};
  features.forEach(f => {
    const cls = prop(f, "ROAD_CLASSIFICATION");
    totals[cls] = (totals[cls] || 0) + num(f, "Length_km");
  });

  const labels = Object.keys(totals);
  const values = labels.map(l => totals[l]);
  const palette = ["#d32f2f", "#2e7d32", "#ff9800", "#1565c0", "#6a1b3d", "#8bc34a"];

  const ctx = document.getElementById("roadClassChart").getContext("2d");
  if (roadClassChart) roadClassChart.destroy();
  roadClassChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: labels.map((_, i) => palette[i % palette.length]) }]
    },
    options: {
      plugins: { legend: { display: false }, datalabels: { display: false } },
      scales: { y: { beginAtZero: true, title: { display: true, text: "km" } } }
    }
  });
}

/* ---------- Surface type bar chart (by length km, same style as Road Classification) ---------- */
function renderSurfaceTypeChart(features) {
  const totals = {};
  features.forEach(f => {
    const s = prop(f, "ROAD_SURFACE_TYPE");
    totals[s] = (totals[s] || 0) + num(f, "Length_km");
  });

  const labels = Object.keys(totals);
  const values = labels.map(l => totals[l]);
  const palette = ["#1a2a6c", "#29b6f6", "#9e9e9e", "#ff9800", "#ffeb3b", "#6a1b3d"];

  const ctx = document.getElementById("surfaceTypeChart").getContext("2d");
  if (surfaceTypeChart) surfaceTypeChart.destroy();
  surfaceTypeChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: labels.map((_, i) => palette[i % palette.length]) }]
    },
    options: {
      plugins: { legend: { display: false }, datalabels: { display: false } },
      scales: { y: { beginAtZero: true, title: { display: true, text: "km" } } }
    }
  });
}

/* ---------- Reset button: clears every filter back to defaults ---------- */
function resetFilters() {
  document.getElementById("districtFilter").value = "";
  document.getElementById("roadFilter").value = "";

  const pciSlider = document.getElementById("pciSlider");
  pciSlider.value = 0;
  document.getElementById("pciSliderValue").textContent = "0 – 100";

  const widthSlider = document.getElementById("widthSlider");
  widthSlider.value = widthSlider.min;
  document.getElementById("widthSliderValue").textContent =
    `${parseFloat(widthSlider.min).toFixed(1)} – ${parseFloat(widthSlider.max).toFixed(1)}`;

  document.getElementById("basemapFilter").value = "light";
  setBasemap("light");

  renderAll(rawGeojson.features);
}
