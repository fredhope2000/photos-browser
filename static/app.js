const resultsEl = document.getElementById("results");
const detailEl = document.getElementById("detail");
const queryEl = document.getElementById("query");
const searchButtonEl = document.getElementById("search-button");
const includeInferredEl = document.getElementById("include-inferred");
const layoutModeEl = document.getElementById("layout-mode");
const resultsLayoutEl = document.querySelector(".results-layout");
const paneResizerEl = document.getElementById("pane-resizer");

let currentActiveUuid = null;
let activeResizePointerId = null;
let currentAssets = [];
let currentOffset = 0;
let hasMoreResults = true;
let isLoadingResults = false;
let currentSearchKey = "";

const LAYOUT_STORAGE_KEY = "photos-browser-results-width-px";
const VIEW_MODE_STORAGE_KEY = "photos-browser-layout-mode";
const INCLUDE_INFERRED_STORAGE_KEY = "photos-browser-include-inferred";
const RESULTS_MIN_WIDTH = 280;
const DETAIL_MIN_WIDTH = 420;
const RESIZER_WIDTH = 12;
const PAGE_SIZE = 40;
const SCROLL_THRESHOLD_PX = 320;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getMaxResultsWidth() {
  const bounds = resultsLayoutEl.getBoundingClientRect();
  return Math.max(RESULTS_MIN_WIDTH, bounds.width - DETAIL_MIN_WIDTH - RESIZER_WIDTH);
}

function applyResultsWidth(widthPx) {
  const clampedWidth = clamp(widthPx, RESULTS_MIN_WIDTH, getMaxResultsWidth());
  resultsLayoutEl.style.setProperty("--results-width", `${clampedWidth}px`);
}

function loadPaneWidth() {
  const stored = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
  if (!stored) {
    return;
  }
  const parsed = Number.parseFloat(stored);
  if (!Number.isNaN(parsed)) {
    applyResultsWidth(parsed);
  }
}

function loadUiPreferences() {
  const savedLayout = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  if (savedLayout === "list" || savedLayout === "grid") {
    layoutModeEl.value = savedLayout;
  }

  const savedIncludeInferred = window.localStorage.getItem(INCLUDE_INFERRED_STORAGE_KEY);
  if (savedIncludeInferred === "1" || savedIncludeInferred === "0") {
    includeInferredEl.checked = savedIncludeInferred === "1";
  }
}

function beginResize(event) {
  if (window.innerWidth <= 960) {
    return;
  }
  activeResizePointerId = event.pointerId;
  paneResizerEl.setPointerCapture(activeResizePointerId);
  resultsLayoutEl.classList.add("is-resizing");
}

function updateResize(event) {
  if (activeResizePointerId !== event.pointerId || window.innerWidth <= 960) {
    return;
  }
  const bounds = resultsLayoutEl.getBoundingClientRect();
  const leftWidth = event.clientX - bounds.left - (RESIZER_WIDTH / 2);
  const clampedWidth = clamp(leftWidth, RESULTS_MIN_WIDTH, getMaxResultsWidth());
  applyResultsWidth(clampedWidth);
  window.localStorage.setItem(LAYOUT_STORAGE_KEY, String(clampedWidth));
}

function endResize(event) {
  if (activeResizePointerId !== event.pointerId) {
    return;
  }
  paneResizerEl.releasePointerCapture(activeResizePointerId);
  activeResizePointerId = null;
  resultsLayoutEl.classList.remove("is-resizing");
}

function mediaMarkup(asset) {
  const filename = (asset.current_filename || "").toLowerCase();
  if (filename.endsWith(".mov") || filename.endsWith(".mp4") || filename.endsWith(".m4v")) {
    return `<video controls preload="metadata" src="${asset.media_url}"></video>`;
  }
  return `<img src="${asset.media_url}" loading="eager" alt="${escapeHtml(asset.original_filename || asset.current_filename || asset.asset_uuid)}">`;
}

function thumbnailMarkup(asset) {
  const filename = (asset.current_filename || "").toLowerCase();
  if (filename.endsWith(".mov") || filename.endsWith(".mp4") || filename.endsWith(".m4v")) {
    return `<video muted playsinline preload="none" src="${asset.media_url}"></video>`;
  }
  return `<img src="${asset.media_url}" loading="lazy" alt="${escapeHtml(asset.original_filename || asset.current_filename || asset.asset_uuid)}">`;
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
  const keywords = splitValues(asset.keywords);
  const generatedTags = splitValues(asset.generated_tags);
  const description = asset.description || asset.summary || asset.notes || "";

  detailEl.innerHTML = `
    <div class="media-frame">${mediaMarkup(asset)}</div>
    ${description ? `<div class="detail-copy">${escapeHtml(description)}</div>` : ""}
    <div class="detail-block">
      <h2 class="detail-title">${escapeHtml(asset.title || asset.original_filename || asset.current_filename)}</h2>
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
    ${chipSection("Keywords", keywords, "No keywords")}
    ${maybeChipSection("Derived Tags", generatedTags)}
  `;
}

function updateActiveCard() {
  for (const card of resultsEl.querySelectorAll(".result-card")) {
    card.classList.toggle("active", card.dataset.uuid === currentActiveUuid);
  }
}

function selectAsset(assetUuid) {
  const asset = currentAssets.find((item) => item.asset_uuid === assetUuid);
  if (!asset) {
    return;
  }
  currentActiveUuid = asset.asset_uuid;
  updateActiveCard();
  renderDetail(asset);
}

function bindResultCardHandlers() {
  for (const card of resultsEl.querySelectorAll(".result-card")) {
    if (card.dataset.boundClick === "1") {
      continue;
    }
    card.dataset.boundClick = "1";
    card.addEventListener("click", () => {
      selectAsset(card.dataset.uuid);
    });
  }
}

function renderResultItems(assets) {
  const layoutMode = layoutModeEl.value;
  if (layoutMode === "grid") {
    return assets.map((asset) => `
      <article class="result-card result-tile${asset.asset_uuid === currentActiveUuid ? " active" : ""}" data-uuid="${asset.asset_uuid}">
        <div class="tile-media">${thumbnailMarkup(asset)}</div>
        <div class="tile-body">
          <h2 class="result-title">${escapeHtml(asset.title || asset.original_filename || asset.current_filename)}</h2>
          <p class="result-meta">${escapeHtml(asset.created_utc || "Unknown time")}</p>
          <p class="result-meta">${escapeHtml(asset.keywords || asset.generated_tags || asset.original_path)}</p>
        </div>
      </article>
    `).join("");
  }
  return assets.map((asset) => `
    <article class="result-card${asset.asset_uuid === currentActiveUuid ? " active" : ""}" data-uuid="${asset.asset_uuid}">
      <h2 class="result-title">${escapeHtml(asset.title || asset.original_filename || asset.current_filename)}</h2>
      <p class="result-meta">${escapeHtml(asset.created_utc || "Unknown time")}</p>
      <p class="result-meta">${escapeHtml(asset.keywords || asset.generated_tags || asset.original_path)}</p>
    </article>
  `).join("");
}

function renderResults(assets, { append = false } = {}) {
  currentAssets = append ? currentAssets.concat(assets) : assets;
  if (!currentAssets.length) {
    resultsEl.innerHTML = '<p class="detail-empty">No results.</p>';
    detailEl.innerHTML = '<p class="detail-empty">Try a broader search.</p>';
    currentAssets = [];
    return;
  }

  if ((!append || !currentActiveUuid) && currentAssets[0]) {
    currentActiveUuid = currentAssets[0].asset_uuid;
  }

  const selected = currentAssets.find((asset) => asset.asset_uuid === currentActiveUuid) || currentAssets[0];
  currentActiveUuid = selected.asset_uuid;

  const layoutMode = layoutModeEl.value;
  resultsEl.classList.toggle("results-grid", layoutMode === "grid");
  resultsEl.classList.toggle("results-list", layoutMode !== "grid");
  if (append) {
    resultsEl.insertAdjacentHTML("beforeend", renderResultItems(assets));
    updateActiveCard();
  } else {
    resultsEl.innerHTML = renderResultItems(currentAssets);
  }

  renderDetail(selected);
  bindResultCardHandlers();
}

function getSearchKey() {
  return JSON.stringify({
    q: queryEl.value,
    includeInferred: includeInferredEl.checked,
    layout: layoutModeEl.value,
  });
}

async function loadResults({ append = false } = {}) {
  const searchKey = getSearchKey();
  if (!append) {
    currentSearchKey = searchKey;
    currentOffset = 0;
    hasMoreResults = true;
    currentAssets = [];
  } else if (isLoadingResults || !hasMoreResults || searchKey !== currentSearchKey) {
    return;
  }

  isLoadingResults = true;
  const query = new URLSearchParams({
    q: queryEl.value,
    limit: String(PAGE_SIZE),
    offset: String(currentOffset),
    include_inferred: includeInferredEl.checked ? "1" : "0",
  });
  const response = await fetch(`/api/assets?${query.toString()}`);
  isLoadingResults = false;
  if (!response.ok) {
    if (!append) {
      resultsEl.innerHTML = '<p class="detail-empty">Failed to load results.</p>';
    }
    return;
  }
  const payload = await response.json();
  currentOffset = payload.next_offset;
  hasMoreResults = payload.has_more;
  renderResults(payload.items, { append });
}

function maybeLoadMoreResults() {
  if (!hasMoreResults || isLoadingResults) {
    return;
  }
  const remaining = resultsEl.scrollHeight - resultsEl.scrollTop - resultsEl.clientHeight;
  if (remaining <= SCROLL_THRESHOLD_PX) {
    loadResults({ append: true });
  }
}

searchButtonEl.addEventListener("click", loadResults);
includeInferredEl.addEventListener("change", () => {
  window.localStorage.setItem(INCLUDE_INFERRED_STORAGE_KEY, includeInferredEl.checked ? "1" : "0");
  loadResults();
});
layoutModeEl.addEventListener("change", () => {
  window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, layoutModeEl.value);
  loadResults();
});
queryEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    loadResults();
  }
});

paneResizerEl.addEventListener("pointerdown", beginResize);
paneResizerEl.addEventListener("pointermove", updateResize);
paneResizerEl.addEventListener("pointerup", endResize);
paneResizerEl.addEventListener("pointercancel", endResize);
resultsEl.addEventListener("scroll", maybeLoadMoreResults);
window.addEventListener("resize", () => {
  const current = Number.parseFloat(getComputedStyle(resultsLayoutEl).getPropertyValue("--results-width"));
  if (!Number.isNaN(current)) {
    applyResultsWidth(current);
  }
});

loadUiPreferences();
loadPaneWidth();
loadResults();
