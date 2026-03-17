const resultsEl = document.getElementById("results");
const detailEl = document.getElementById("detail");
const queryEl = document.getElementById("query");
const searchButtonEl = document.getElementById("search-button");

let currentActiveUuid = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function mediaMarkup(asset) {
  const filename = (asset.current_filename || "").toLowerCase();
  if (filename.endsWith(".mov") || filename.endsWith(".mp4") || filename.endsWith(".m4v")) {
    return `<video controls preload="metadata" src="${asset.media_url}"></video>`;
  }
  return `<img src="${asset.media_url}" alt="${escapeHtml(asset.original_filename || asset.current_filename || asset.asset_uuid)}">`;
}

function chipMarkup(label) {
  return `<span class="chip">${escapeHtml(label)}</span>`;
}

function splitValues(value) {
  return value ? value.split("; ").filter(Boolean) : [];
}

function chipSection(label, values, emptyLabel) {
  const content = values.length
    ? values.map(chipMarkup).join("")
    : `<span class="detail-meta">${escapeHtml(emptyLabel)}</span>`;
  return `
    <div class="detail-block">
      <span class="detail-label">${escapeHtml(label)}</span>
      <div class="chip-row">${content}</div>
    </div>
  `;
}

function maybeChipSection(label, values) {
  if (!values.length) {
    return "";
  }
  return chipSection(label, values, "");
}

function renderDetail(asset) {
  const location = [asset.place_name, asset.region, asset.country].filter(Boolean).join(", ");
  const coords = asset.latitude != null && asset.longitude != null
    ? `${asset.latitude}, ${asset.longitude}`
    : "";
  const albums = splitValues(asset.albums);
  const keywords = splitValues(asset.keywords);
  const generatedTags = splitValues(asset.generated_tags);

  detailEl.innerHTML = `
    <div class="media-frame">${mediaMarkup(asset)}</div>
    <div class="detail-block">
      <h2 class="result-title">${escapeHtml(asset.title || asset.original_filename || asset.current_filename)}</h2>
      <p class="detail-meta">${escapeHtml(asset.created_utc || "Unknown capture time")}</p>
    </div>
    <div class="detail-block">
      <span class="detail-label">File</span>
      <code>${escapeHtml(asset.original_path)}</code>
    </div>
    <div class="detail-block">
      <span class="detail-label">Details</span>
      <div class="detail-meta">${escapeHtml([location, coords].filter(Boolean).join(" | ") || "No location metadata")}</div>
      <div class="detail-meta">${escapeHtml(`${asset.width || "?"} x ${asset.height || "?"}`)}</div>
    </div>
    <div class="detail-block">
      <span class="detail-label">Description</span>
      <div>${escapeHtml(asset.description || asset.summary || asset.notes || "No description yet")}</div>
    </div>
    ${chipSection("Albums", albums, "No albums")}
    ${chipSection("Keywords", keywords, "No keywords")}
    ${maybeChipSection("Derived Tags", generatedTags)}
  `;
}

function renderResults(assets) {
  if (!assets.length) {
    resultsEl.innerHTML = '<p class="detail-empty">No results.</p>';
    detailEl.innerHTML = '<p class="detail-empty">Try a broader search.</p>';
    return;
  }

  if (!currentActiveUuid && assets[0]) {
    currentActiveUuid = assets[0].asset_uuid;
  }

  const selected = assets.find((asset) => asset.asset_uuid === currentActiveUuid) || assets[0];
  currentActiveUuid = selected.asset_uuid;

  resultsEl.innerHTML = assets.map((asset) => `
    <article class="result-card${asset.asset_uuid === currentActiveUuid ? " active" : ""}" data-uuid="${asset.asset_uuid}">
      <h2 class="result-title">${escapeHtml(asset.title || asset.original_filename || asset.current_filename)}</h2>
      <p class="result-meta">${escapeHtml(asset.created_utc || "Unknown time")}</p>
      <p class="result-meta">${escapeHtml(asset.albums || asset.keywords || asset.generated_tags || asset.original_path)}</p>
    </article>
  `).join("");

  renderDetail(selected);

  for (const card of resultsEl.querySelectorAll(".result-card")) {
    card.addEventListener("click", () => {
      currentActiveUuid = card.dataset.uuid;
      renderResults(assets);
    });
  }
}

async function loadResults() {
  const query = new URLSearchParams({ q: queryEl.value, limit: "40" });
  const response = await fetch(`/api/assets?${query.toString()}`);
  if (!response.ok) {
    resultsEl.innerHTML = '<p class="detail-empty">Failed to load results.</p>';
    return;
  }
  const assets = await response.json();
  renderResults(assets);
}

searchButtonEl.addEventListener("click", loadResults);
queryEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    loadResults();
  }
});

loadResults();
