# Pavement Condition Dashboard – Setup

## Files
- `index.html` — page structure
- `style.css` — styling
- `script.js` — loads GeoJSON, draws map/charts/legend, handles filters
- Put your `EFAP_PCI.geojson` file in this same folder (or edit `GEOJSON_PATH` at the top of `script.js` to point to it).

## How to run in VS Code
1. Copy `EFAP_PCI.geojson` into this folder.
2. Install the **Live Server** extension in VS Code (if not already installed).
3. Right-click `index.html` → **Open with Live Server**.
   - Opening `index.html` by double-clicking (file:// URL) will usually fail to `fetch()` the GeoJSON due to browser security — always serve it over http (Live Server, or `python -m http.server`).

## What it does
- Reads every feature's properties from the GeoJSON (`DISTRICT`, `ROAD_NAME`, `ROAD_CLASSIFICATION`, `ROAD_SURFACE_TYPE`, `CARRIAGEWAY_WIDTH`, `PCI_VALUE`, `PCI_RATING`, `Length_km`, etc.)
- **Total Network Length** KPI = sum of `Length_km`.
- **Map lines / legend / pie chart** all use one simplified 4-color scheme (see `getBucket()` in `script.js`):
  - `Good` or `Satisfactory` PCI_RATING → **Green**
  - `Fair` → **Yellow**
  - `Poor`, `Very Poor`, `Serious`, `Failed` → **Red**
  - Any `ROAD_SURFACE_TYPE` containing "Gatch" (kutcha/unpaved) → **Blue**, regardless of its PCI_RATING
- **Road Classification** bar chart = total km per `ROAD_CLASSIFICATION`.
- **Surface Type** bar chart = section count per `ROAD_SURFACE_TYPE`.
- **Filters** (top bar, single row):
  - PCI Value Slider — minimum `PCI_VALUE`
  - Select District — `DISTRICT`
  - Search by Road Name — `ROAD_NAME`
  - Select a number — minimum `CARRIAGEWAY_WIDTH` (range auto-computed from your data on load)
  - Basemap — switch between Light / Dark / Streets / Satellite / Terrain tiles
  - The first four re-filter the map and every chart together; Basemap only changes the background tiles.
- **Pie chart** now shows the percentage directly on each slice (via `chartjs-plugin-datalabels`), in addition to the legend.

## Customizing
- Colors per bucket: edit `BUCKET_COLORS` in `script.js`.
- Bucket logic (which ratings/surfaces map to which color): edit the `getBucket()` function. Matching is case-insensitive; if `PCI_RATING` text doesn't match a known keyword, it falls back to `PCI_VALUE` thresholds (≥70 Good, 40–69 Fair, <40 Poor) so nothing is left unclassified.
- Basemap tile URLs: edit the `BASEMAPS` object.
- Want the pie chart / legend to show **section counts** instead of length-weighted %? In `renderLegendAndPie`, change `totals[bucket] += len;` to `totals[bucket] += 1;`.
- Basemap: currently CartoDB light tiles — swap the `L.tileLayer` URL for satellite/OSM/etc. if you prefer.
- If your real field names differ slightly (e.g. spacing/case), adjust the `prop(...)`/`num(...)` key strings used throughout `script.js` — they reference your exact column names as given.
