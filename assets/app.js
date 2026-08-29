import * as pdfjsLib from "./vendor/pdfjs/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.mjs", import.meta.url).href;

const dom = {
  searchForm: document.querySelector("#searchForm"),
  searchTokenInput: document.querySelector("#searchTokenInput"),
  searchTokens: document.querySelector("#searchTokens"),
  searchInput: document.querySelector("#searchInput"),
  systemStatus: document.querySelector("#systemStatus"),
  buildingCount: document.querySelector("#buildingCount"),
  buildingGroups: document.querySelector("#buildingGroups"),
  selectedBuildingName: document.querySelector("#selectedBuildingName"),
  selectedFloorMeta: document.querySelector("#selectedFloorMeta"),
  floorGrid: document.querySelector("#floorGrid"),
  currentFile: document.querySelector("#currentFile"),
  pdfSearchForm: document.querySelector("#pdfSearchForm"),
  pdfSearchTokenInput: document.querySelector("#pdfSearchTokenInput"),
  pdfSearchTokens: document.querySelector("#pdfSearchTokens"),
  pdfSearchInput: document.querySelector("#pdfSearchInput"),
  pdfSearchMessage: document.querySelector("#pdfSearchMessage"),
  pdfSearchOverlay: document.querySelector("#pdfSearchOverlay"),
  pdfSearchOverlayForm: document.querySelector("#pdfSearchOverlayForm"),
  pdfSearchOverlayTokenInput: document.querySelector("#pdfSearchOverlayTokenInput"),
  pdfSearchOverlayTokens: document.querySelector("#pdfSearchOverlayTokens"),
  pdfSearchOverlayInput: document.querySelector("#pdfSearchOverlayInput"),
  pdfSearchOverlayClose: document.querySelector("#pdfSearchOverlayClose"),
  pageStatus: document.querySelector("#pageStatus"),
  prevPageButton: document.querySelector("#prevPageButton"),
  nextPageButton: document.querySelector("#nextPageButton"),
  zoomOutButton: document.querySelector("#zoomOutButton"),
  fitButton: document.querySelector("#fitButton"),
  zoomStatus: document.querySelector("#zoomStatus"),
  zoomInButton: document.querySelector("#zoomInButton"),
  clearMarkerButton: document.querySelector("#clearMarkerButton"),
  saveImageButton: document.querySelector("#saveImageButton"),
  openPdfButton: document.querySelector("#openPdfButton"),
  viewerShell: document.querySelector("#viewerShell"),
  emptyState: document.querySelector("#emptyState"),
  pdfPage: document.querySelector("#pdfPage"),
  pdfCanvas: document.querySelector("#pdfCanvas"),
  markerLayer: document.querySelector("#markerLayer"),
  workspace: document.querySelector(".workspace"),
  resultsPanel: document.querySelector(".results-panel"),
  resultCount: document.querySelector("#resultCount"),
  resultSummary: document.querySelector("#resultSummary"),
  resultsList: document.querySelector("#resultsList"),
  imageExportDialog: document.querySelector("#imageExportDialog"),
  imageExportBackdrop: document.querySelector("#imageExportBackdrop"),
  imageExportClose: document.querySelector("#imageExportClose"),
  imageExportPreview: document.querySelector("#imageExportPreview"),
  imageExportShare: document.querySelector("#imageExportShare"),
  imageExportDownload: document.querySelector("#imageExportDownload"),
};

const state = {
  index: null,
  buildingData: null,
  filesById: new Map(),
  buildingsByName: new Map(),
  selectedBuilding: null,
  selectedFileId: null,
  selectedResultId: null,
  pdfDoc: null,
  currentPath: null,
  currentPage: 1,
  currentPageCount: 0,
  zoom: 1,
  markers: [],
  renderToken: 0,
  shownPdfSearchFileIds: new Set(),
  wheelZoomTimer: null,
  wheelZoomFocus: null,
  isPanning: false,
  panStartX: 0,
  panStartY: 0,
  panStartLeft: 0,
  panStartTop: 0,
  isTouchPanning: false,
  isTouchZooming: false,
  touchStartDistance: 0,
  touchStartZoom: 1,
  touchStartScrollLeft: 0,
  touchStartScrollTop: 0,
  touchStartFocusX: 0,
  touchStartFocusY: 0,
  touchZoomTimer: null,
  touchZoomFocus: null,
  activeTouchPointers: new Map(),
  touchPanPointerId: null,
  imageExport: null,
};

const MIN_ZOOM = 0.45;
const MAX_ZOOM = 8;
const MAX_RENDER_PIXELS = 24_000_000;
const EXPORT_IMAGE_SCALE = 2;
const DETECTOR_SCAN_PATTERN = /(?:\d+:)?M\d+-\d+|M[1-9]\d*/gi;
const DETECTOR_AUTO_COMMIT_DELAY = 520;

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[－–—]/g, "-")
    .replace(/[：]/g, ":")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function normalizeLooseText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[－–—]/g, "-")
    .replace(/[：]/g, ":")
    .toUpperCase();
}

function normalizeDetectorCode(value) {
  const normalized = normalizeText(value);
  const fullCode = /^(?:\d+:)?M(\d+)-(\d+)$/.exec(normalized);

  if (fullCode) {
    const loop = Number(fullCode[1]);
    const detector = Number(fullCode[2]);
    if (!Number.isInteger(loop) || !Number.isInteger(detector) || loop <= 0 || detector <= 0) return null;
    return `M${loop}-${detector}`;
  }

  const shortCode = /^M([1-9])(\d+)$/.exec(normalized);
  if (shortCode) {
    const detector = Number(shortCode[2]);
    if (!Number.isInteger(detector) || detector <= 0) return null;
    return `M${shortCode[1]}-${detector}`;
  }

  return null;
}

function detectorNumberDigitLength(value) {
  const normalized = normalizeText(value);
  const fullCode = /^(?:\d+:)?M\d+-(\d+)$/.exec(normalized);
  if (fullCode) return fullCode[1].length;

  const shortCode = /^M[1-9](\d+)$/.exec(normalized);
  if (shortCode) return shortCode[1].length;

  return 0;
}

function uniqueDetectors(detectors) {
  return [...new Set(detectors.filter(Boolean))];
}

function detectorListText(detectors, limit = 5) {
  const visible = detectors.slice(0, limit);
  const suffix = detectors.length > visible.length ? ` 等 ${detectors.length} 個` : "";
  return `${visible.join("、")}${suffix}`;
}

function extractDetectorCodes(text) {
  const codes = [];
  const normalized = normalizeLooseText(text);
  const remainder = normalized
    .replace(DETECTOR_SCAN_PATTERN, (match) => {
      const detector = normalizeDetectorCode(match);
      if (!detector) return match;
      codes.push(detector);
      return " ";
    })
    .replace(/[,\uFF0C\u3001;\uFF1B]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    codes: uniqueDetectors(codes),
    remainder,
  };
}

function createDetectorTokenInput(options) {
  const { shell, list, input, allowFreeText = false } = options;
  let detectors = [];
  let autoCommitTimer = null;

  function render() {
    list.innerHTML = detectors
      .map((detector) => `
        <span class="detector-token">
          <span>${detector}</span>
          <button type="button" data-token-value="${detector}" aria-label="移除 ${detector}">×</button>
        </span>
      `)
      .join("");
  }

  function add(nextDetectors) {
    const before = detectors.length;
    detectors = uniqueDetectors([...detectors, ...nextDetectors]);
    if (detectors.length !== before) render();
    return detectors.length !== before;
  }

  function commitInput(options = {}) {
    const rawValue = input.value;
    const extracted = extractDetectorCodes(rawValue);
    const hasDetectorText = extracted.codes.length > 0;

    if (!hasDetectorText) return false;

    const shouldCommit =
      options.force ||
      /[\s,\uFF0C\u3001;\uFF1B]/.test(rawValue) ||
      normalizeDetectorCode(rawValue);

    if (!shouldCommit) return false;

    add(extracted.codes);
    input.value = allowFreeText ? extracted.remainder : "";
    return true;
  }

  function scheduleAutoCommit() {
    window.clearTimeout(autoCommitTimer);
    autoCommitTimer = window.setTimeout(() => {
      commitInput({ force: false });
    }, DETECTOR_AUTO_COMMIT_DELAY);
  }

  shell.addEventListener("click", () => input.focus());

  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-token-value]");
    if (!button) return;

    detectors = detectors.filter((detector) => detector !== button.dataset.tokenValue);
    render();
    input.focus();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Backspace" && input.value === "" && detectors.length > 0) {
      detectors.pop();
      render();
      return;
    }

    if (event.key === " " || event.key === "," || event.key === "、") {
      const committed = commitInput({ force: true });
      if (committed && input.value === "") {
        event.preventDefault();
      }
    }

    if (event.key === "Enter") {
      commitInput({ force: true });
    }
  });

  input.addEventListener("input", () => {
    const rawValue = input.value;
    if (/[\n,\uFF0C\u3001;\uFF1B]/.test(rawValue) || /\s/.test(rawValue.trim())) {
      commitInput({ force: true });
      return;
    }

    if (normalizeDetectorCode(rawValue) && detectorNumberDigitLength(rawValue) >= 2) {
      scheduleAutoCommit();
      return;
    }

    window.clearTimeout(autoCommitTimer);
  });

  input.addEventListener("blur", () => commitInput({ force: true }));

  return {
    getDetectors: () => [...detectors],
    getText: () => input.value.trim(),
    setDetectors(nextDetectors) {
      detectors = uniqueDetectors(nextDetectors);
      input.value = "";
      render();
    },
    clear() {
      detectors = [];
      input.value = "";
      render();
    },
    commit: () => commitInput({ force: true }),
    focus: () => input.focus(),
  };
}

function resourceUrl(relativePath) {
  return relativePath.split("/").map((part) => encodeURIComponent(part)).join("/");
}

const tokenInputs = {
  global: createDetectorTokenInput({
    shell: dom.searchTokenInput,
    list: dom.searchTokens,
    input: dom.searchInput,
    allowFreeText: true,
  }),
  pdf: createDetectorTokenInput({
    shell: dom.pdfSearchTokenInput,
    list: dom.pdfSearchTokens,
    input: dom.pdfSearchInput,
  }),
  overlay: createDetectorTokenInput({
    shell: dom.pdfSearchOverlayTokenInput,
    list: dom.pdfSearchOverlayTokens,
    input: dom.pdfSearchOverlayInput,
  }),
};

function fileName(relativePath) {
  return relativePath.split("/").at(-1) || relativePath;
}

function floorSortValue(label) {
  const value = normalizeText(label);
  const token = value.match(/RF|R\d+F?|\d+MF|\d+F|B\d+F?/);
  const target = token ? token[0] : value;

  if (target === "RF") return 2000;
  const roof = /^R(\d+)F?$/.exec(target);
  if (roof) return 2000 + Number(roof[1]);
  const mezzanine = /^(\d+)MF$/.exec(target);
  if (mezzanine) return Number(mezzanine[1]) + 0.5;
  const floor = /^(\d+)F$/.exec(target);
  if (floor) return Number(floor[1]);
  const basement = /^B(\d+)F?$/.exec(target);
  if (basement) return -Number(basement[1]);
  return -9999;
}

function canvasRenderScale(viewport) {
  const deviceScale = window.devicePixelRatio || 1;
  const cssPixels = Math.max(1, viewport.width * viewport.height);
  const maxScale = Math.sqrt(MAX_RENDER_PIXELS / cssPixels);
  return Math.max(1, Math.min(deviceScale, maxScale));
}

function setStatus(message) {
  dom.systemStatus.textContent = message;
}

function flashSection(element) {
  if (!element) return;

  element.classList.remove("is-attention");
  void element.offsetWidth;
  element.classList.add("is-attention");
  window.setTimeout(() => element.classList.remove("is-attention"), 1200);
}

function scrollToSection(element) {
  if (!element) return;

  requestAnimationFrame(() => {
    element.scrollIntoView({ behavior: "smooth", block: "start" });
    flashSection(element);
  });
}

function blurActiveFormControl(form) {
  const activeElement = document.activeElement;
  if (!activeElement || !form.contains(activeElement)) return;
  if (typeof activeElement.blur === "function") {
    activeElement.blur();
  }
}

function showSearchResults() {
  scrollToSection(dom.resultsPanel);
}

function showPdfWorkspace() {
  scrollToSection(dom.workspace);
}

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} 載入失敗`);
  }
  return response.json();
}

async function init() {
  try {
    const [index, buildingData] = await Promise.all([
      loadJson("./data/fire-map-index.json"),
      loadJson("./data/buildings.json"),
    ]);

    state.index = index;
    state.buildingData = buildingData;
    state.filesById = new Map(index.files.map((file) => [file.id, file]));
    state.buildingsByName = new Map(buildingData.buildings.map((building) => [building.name, building]));

    dom.buildingCount.textContent = `${buildingData.buildings.length} 座`;
    setStatus(`${index.totals.files} 份 PDF / ${index.totals.entries.toLocaleString("zh-TW")} 筆標籤`);

    renderBuildings();
    selectBuilding(state.buildingsByName.has("長青樓") ? "長青樓" : buildingData.buildings[0]?.name, { openFirstFloor: false });
    renderResults([], "輸入探測器編號後會顯示可選位置。");
    updatePdfControls();
  } catch (error) {
    setStatus("索引載入失敗");
    dom.resultsList.innerHTML = `<div class="message">${error.message}</div>`;
  }
}

function renderBuildings() {
  const groups = state.buildingData.groups
    .map((group) => {
      const buildings = group.buildings
        .map((name) => state.buildingsByName.get(name))
        .filter(Boolean);
      return { ...group, buildings };
    })
    .filter((group) => group.buildings.length > 0);

  dom.buildingGroups.innerHTML = groups
    .map((group) => `
      <section class="building-group">
        <div class="building-group-title">${group.title}</div>
        <div class="building-list">
          ${group.buildings
            .map((building) => `
              <button class="building-button" type="button" data-building="${building.name}">
                <strong>${building.name}</strong>
                <span>${building.floors.length} 層</span>
              </button>
            `)
            .join("")}
        </div>
      </section>
    `)
    .join("");

  dom.buildingGroups.querySelectorAll("[data-building]").forEach((button) => {
    button.addEventListener("click", () => selectBuilding(button.dataset.building, { openFirstFloor: false }));
  });
}

function selectBuilding(buildingName, options = {}) {
  if (!buildingName || !state.buildingsByName.has(buildingName)) return;

  state.selectedBuilding = buildingName;
  const building = state.buildingsByName.get(buildingName);
  dom.selectedBuildingName.textContent = buildingName;
  dom.selectedFloorMeta.textContent = `${building.floors.length} 個樓層圖`;

  dom.buildingGroups.querySelectorAll(".building-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.building === buildingName);
  });

  renderFloors(building);

  if (options.openFirstFloor && building.floors[0]) {
    openFile(building.floors[0].fileId, { markers: [] });
  }
}

function renderFloors(building) {
  dom.floorGrid.innerHTML = building.floors
    .map((floor) => `
      <button class="floor-button" type="button" data-file-id="${floor.fileId}" title="${fileName(floor.path)}">
        ${floor.label}
      </button>
    `)
    .join("");

  dom.floorGrid.querySelectorAll("[data-file-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedResultId = null;
      openFile(button.dataset.fileId, { markers: [], showPdfSearchOverlay: true });
    });
  });

  markActiveFloor();
}

function markActiveFloor() {
  dom.floorGrid.querySelectorAll(".floor-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.fileId === state.selectedFileId);
  });
}

function parseQuery(query, detectors = []) {
  const extracted = extractDetectorCodes(query);
  const parsedDetectors = uniqueDetectors([...detectors, ...extracted.codes]);
  const normalized = normalizeText(extracted.remainder);
  const buildings = [...state.buildingsByName.keys()].sort((left, right) => right.length - left.length);
  const building = buildings.find((name) => normalized.includes(normalizeText(name))) || null;
  const candidateFloors = building
    ? state.buildingsByName.get(building).floors.map((floor) => floor.label)
    : [...new Set(state.index.files.map((file) => file.floor))];
  const floor = candidateFloors
    .sort((left, right) => normalizeText(right).length - normalizeText(left).length)
    .find((label) => normalized.includes(normalizeText(label))) || null;

  return {
    query,
    normalized,
    building,
    floor,
    detector: parsedDetectors[0] || null,
    detectors: parsedDetectors,
  };
}

function presentSearchResults(results, summary, options = {}) {
  renderResults(results, summary, options);
  showSearchResults();
}

function handleSearch(query, detectors = []) {
  if (!state.index || !state.buildingData) {
    presentSearchResults([], "索引載入中，請稍候再搜尋。");
    return;
  }

  const trimmed = query.trim();
  const parsed = parseQuery(trimmed, detectors);

  if (!trimmed && parsed.detectors.length === 0) {
    presentSearchResults([], "請輸入探測器編號、棟別或樓層。");
    return;
  }

  if (parsed.building) {
    selectBuilding(parsed.building, { openFirstFloor: false });
  }

  if (parsed.detectors.length === 0) {
    handleNavigationSearch(parsed);
    return;
  }

  const results = searchDetectors(parsed);

  if (parsed.building && parsed.floor && results.length > 0) {
    if (parsed.detectors.length === 1) {
      openResult(results[0], { scrollToViewer: false });
      presentSearchResults(results, `已找到 ${results.length} 筆符合 ${parsed.detector} 的位置，並開啟第一筆。`);
      return;
    }

    state.selectedResultId = results[0].id;
    openFile(results[0].fileId, { page: results[0].page, markers: results });
    presentSearchResults(results, buildResultSummary(parsed, results), { detectors: parsed.detectors });
    return;
  }

  presentSearchResults(results, buildResultSummary(parsed, results), { detectors: parsed.detectors });
}

function handleNavigationSearch(parsed) {
  if (parsed.building && parsed.floor) {
    const building = state.buildingsByName.get(parsed.building);
    const floor = building.floors.find((candidate) => normalizeText(candidate.label) === normalizeText(parsed.floor));
    if (floor) {
      openFile(floor.fileId, { markers: [] });
      presentSearchResults([], `已開啟 ${parsed.building} ${floor.label}。`);
      return;
    }
  }

  if (parsed.building) {
    presentSearchResults([], `已切換到 ${parsed.building}，請選擇樓層或輸入探測器編號。`);
    return;
  }

  presentSearchResults([], "沒有偵測到探測器編號，請輸入例如 M1-66。");
}

function searchDetectors(parsed) {
  const buildingOrder = new Map(state.buildingData.buildings.map((building, index) => [building.name, index]));
  const detectorOrder = new Map(parsed.detectors.map((detector, index) => [detector, index]));
  const detectorSet = new Set(parsed.detectors);

  return state.index.entries
    .filter((entry) => detectorSet.has(entry.normalizedDetector))
    .filter((entry) => !parsed.building || entry.building === parsed.building)
    .filter((entry) => !parsed.floor || normalizeText(entry.floor) === normalizeText(parsed.floor))
    .sort((left, right) => {
      const detectorDelta = (detectorOrder.get(left.normalizedDetector) ?? 999) - (detectorOrder.get(right.normalizedDetector) ?? 999);
      if (detectorDelta) return detectorDelta;
      const buildingDelta = (buildingOrder.get(left.building) ?? 999) - (buildingOrder.get(right.building) ?? 999);
      if (buildingDelta) return buildingDelta;
      const floorDelta = floorSortValue(right.floor) - floorSortValue(left.floor);
      if (floorDelta) return floorDelta;
      return left.label.localeCompare(right.label, "zh-Hant");
    });
}

function detectorSearchStats(detectors, results) {
  const found = new Set(results.map((entry) => entry.normalizedDetector));
  const missing = detectors.filter((detector) => !found.has(detector));
  return { foundCount: found.size, missing };
}

function buildResultSummary(parsed, results) {
  const count = results.length;
  const detectors = parsed.detectors || [parsed.detector].filter(Boolean);
  const scope = [parsed.building, parsed.floor].filter(Boolean).join(" ");

  if (detectors.length > 1) {
    const stats = detectorSearchStats(detectors, results);
    const prefix = scope ? `${scope} ` : "";

    if (count === 0) {
      return `${prefix}找不到 ${detectorListText(detectors)}。`;
    }

    const missingText = stats.missing.length > 0 ? `，找不到 ${detectorListText(stats.missing)}` : "";
    return `${prefix}搜尋 ${detectors.length} 個定址碼，找到 ${stats.foundCount} 個 / ${count} 筆位置${missingText}。`;
  }

  if (count === 0) {
    return scope ? `${scope} 找不到 ${parsed.detector}。` : `找不到 ${parsed.detector}。`;
  }

  if (parsed.building) {
    return `找到 ${count} 筆 ${parsed.building} 內的 ${parsed.detector}，請選擇棟別與樓層後查看。`;
  }

  return `找到 ${count} 筆 ${parsed.detector}，請選擇要查看的位置。`;
}

function renderResultButton(entry) {
  return `
    <button class="result-item${entry.id === state.selectedResultId ? " is-active" : ""}" type="button" data-entry-id="${entry.id}">
      <div class="result-title">
        <strong>${entry.building} ${entry.floor}</strong>
        <span>${entry.detector}</span>
      </div>
      <div class="result-meta">
        <span class="pill">${entry.label}</span>
        <span class="pill">第 ${entry.page} 頁</span>
        <span class="pill">${fileName(entry.path)}</span>
      </div>
    </button>
  `;
}

function renderGroupedResults(results, detectors) {
  const visibleResults = results.slice(0, 160);
  const visibleByDetector = new Map(detectors.map((detector) => [detector, []]));

  visibleResults.forEach((entry) => {
    if (!visibleByDetector.has(entry.normalizedDetector)) {
      visibleByDetector.set(entry.normalizedDetector, []);
    }
    visibleByDetector.get(entry.normalizedDetector).push(entry);
  });

  dom.resultsList.innerHTML = detectors
    .map((detector) => {
      const entries = visibleByDetector.get(detector) || [];
      const content = entries.length > 0
        ? entries.map(renderResultButton).join("")
        : `<div class="message result-group-empty">${detector} 找不到。</div>`;

      return `
        <section class="result-group">
          <div class="result-group-title">${detector}</div>
          ${content}
        </section>
      `;
    })
    .join("");

  if (results.length > visibleResults.length) {
    const message = document.createElement("div");
    message.className = "message";
    message.textContent = `還有 ${results.length - visibleResults.length} 筆未顯示，請增加棟別或樓層條件。`;
    dom.resultsList.append(message);
  }
}

function renderFlatResults(results) {
  const visibleResults = results.slice(0, 160);
  dom.resultsList.innerHTML = visibleResults.map(renderResultButton).join("");

  if (results.length > visibleResults.length) {
    const message = document.createElement("div");
    message.className = "message";
    message.textContent = `還有 ${results.length - visibleResults.length} 筆未顯示，請增加棟別或樓層條件。`;
    dom.resultsList.append(message);
  }
}

function renderResults(results, summary, options = {}) {
  dom.resultCount.textContent = `${results.length} 筆`;
  dom.resultSummary.textContent = summary;

  if (results.length === 0 && (options.detectors?.length || 0) <= 1) {
    dom.resultsList.innerHTML = `<div class="message">${summary}</div>`;
    return;
  }

  if (options.detectors?.length > 1) {
    renderGroupedResults(results, options.detectors);
  } else {
    renderFlatResults(results);
  }

  dom.resultsList.querySelectorAll("[data-entry-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const entry = state.index.entries.find((candidate) => candidate.id === button.dataset.entryId);
      if (entry) openResult(entry, { scrollToViewer: true });
    });
  });
}

function openResult(entry, options = {}) {
  state.selectedResultId = entry.id;
  selectBuilding(entry.building, { openFirstFloor: false });
  const openPromise = openFile(entry.fileId, { page: entry.page, markers: [entry] });

  if (options.scrollToViewer) {
    Promise.resolve(openPromise).then(showPdfWorkspace);
  }

  dom.resultsList.querySelectorAll(".result-item").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.entryId === entry.id);
  });
}

async function openFile(fileId, options = {}) {
  const file = state.filesById.get(fileId);
  if (!file) return;

  state.selectedFileId = fileId;
  state.markers = options.markers || [];
  state.currentPage = options.page || 1;
  state.currentPageCount = file.pageCount || 1;
  state.zoom = options.keepZoom ? state.zoom : 1;

  if (state.selectedBuilding !== file.building) {
    selectBuilding(file.building, { openFirstFloor: false });
  }

  markActiveFloor();
  dom.emptyState.hidden = true;
  dom.pdfPage.hidden = false;
  dom.currentFile.textContent = `${file.building} ${file.floor} - ${fileName(file.path)}`;
  dom.selectedFloorMeta.textContent = `${file.floor} / ${file.detectorCount.toLocaleString("zh-TW")} 筆標籤`;
  clearPdfSearchMessage();
  tokenInputs.pdf.clear();
  tokenInputs.overlay.clear();
  setStatus("載入 PDF 中");

  try {
    if (state.currentPath !== file.path) {
      if (state.pdfDoc) {
        await state.pdfDoc.destroy();
      }
      state.currentPath = file.path;
      state.pdfDoc = await pdfjsLib.getDocument(resourceUrl(file.path)).promise;
      state.currentPageCount = state.pdfDoc.numPages;
    }

    await renderCurrentPage({ scrollToMarker: state.markers.length > 0 });
    if (options.showPdfSearchOverlay) {
      maybeShowPdfSearchOverlay(file.id);
    } else {
      hidePdfSearchOverlay();
    }
    setStatus(`${state.index.totals.files} 份 PDF / ${state.index.totals.entries.toLocaleString("zh-TW")} 筆標籤`);
  } catch (error) {
    console.error(error);
    setStatus("PDF 載入失敗");
    dom.emptyState.hidden = false;
    dom.pdfPage.hidden = true;
    dom.resultsList.innerHTML = `<div class="message">${error.message}</div>`;
  }
}

function clearPdfSearchMessage() {
  if (!dom.pdfSearchMessage) return;

  dom.pdfSearchMessage.textContent = "";
  dom.pdfSearchMessage.classList.remove("is-error");
}

function setPdfSearchMessage(message, options = {}) {
  if (!dom.pdfSearchMessage) return;

  dom.pdfSearchMessage.textContent = message;
  dom.pdfSearchMessage.classList.toggle("is-error", Boolean(options.error));
}

function maybeShowPdfSearchOverlay(fileId) {
  if (!dom.pdfSearchOverlay || state.shownPdfSearchFileIds.has(fileId)) return;

  state.shownPdfSearchFileIds.add(fileId);
  dom.pdfSearchOverlay.style.top = `${dom.viewerShell.scrollTop + 24}px`;
  dom.pdfSearchOverlay.classList.remove("is-hidden");
  tokenInputs.overlay.clear();
  requestAnimationFrame(() => tokenInputs.overlay.focus());
}

function hidePdfSearchOverlay() {
  if (dom.pdfSearchOverlay) {
    dom.pdfSearchOverlay.classList.add("is-hidden");
  }
}

async function handleCurrentPdfSearch(rawQuery, detectors = []) {
  if (!state.index || !state.selectedFileId) {
    setPdfSearchMessage("請先開啟一張 PDF 圖面。", { error: true });
    return;
  }

  const requestedDetectors = uniqueDetectors([...detectors, ...extractDetectorCodes(rawQuery).codes]);
  const file = state.filesById.get(state.selectedFileId);

  if (requestedDetectors.length === 0) {
    setPdfSearchMessage("請輸入定址碼，例如 M1-75 或 M175。", { error: true });
    return;
  }

  const detectorOrder = new Map(requestedDetectors.map((detector, index) => [detector, index]));
  const detectorSet = new Set(requestedDetectors);
  const results = state.index.entries
    .filter((entry) => entry.fileId === state.selectedFileId)
    .filter((entry) => detectorSet.has(entry.normalizedDetector))
    .sort((left, right) => {
      const detectorDelta = (detectorOrder.get(left.normalizedDetector) ?? 999) - (detectorOrder.get(right.normalizedDetector) ?? 999);
      if (detectorDelta) return detectorDelta;
      return left.page - right.page || left.label.localeCompare(right.label, "zh-Hant");
    });

  if (results.length === 0) {
    state.markers = [];
    state.selectedResultId = null;
    dom.markerLayer.innerHTML = "";
    updatePdfControls();
    setPdfSearchMessage(`此圖面找不到 ${detectorListText(requestedDetectors)}。`, { error: true });
    presentSearchResults([], `${file.building} ${file.floor} 找不到 ${detectorListText(requestedDetectors)}。`, {
      detectors: requestedDetectors,
    });
    return;
  }

  const firstResult = results[0];
  const stats = detectorSearchStats(requestedDetectors, results);
  const missingText = stats.missing.length > 0 ? `；找不到 ${detectorListText(stats.missing)}。` : "。";
  state.selectedResultId = firstResult.id;
  state.markers = results;
  state.currentPage = firstResult.page;
  hidePdfSearchOverlay();
  tokenInputs.pdf.setDetectors(requestedDetectors);
  tokenInputs.overlay.setDetectors(requestedDetectors);

  const summary = requestedDetectors.length > 1
    ? `目前圖面搜尋 ${requestedDetectors.length} 個定址碼，找到 ${stats.foundCount} 個 / ${results.length} 筆位置${missingText}`
    : `目前圖面找到 ${results.length} 筆 ${requestedDetectors[0]}，已圈選第一筆。`;

  presentSearchResults(results, summary, { detectors: requestedDetectors });
  await renderCurrentPage({ scrollToMarker: true });
  setPdfSearchMessage(requestedDetectors.length > 1 ? `已圈選 ${results.length} 筆${missingText}` : `已定位 ${firstResult.label}。`);
}

async function renderCurrentPage(options = {}) {
  if (!state.pdfDoc) return;

  const token = ++state.renderToken;
  const page = await state.pdfDoc.getPage(state.currentPage);
  const baseViewport = page.getViewport({ scale: 1 });
  const availableWidth = Math.max(320, dom.viewerShell.clientWidth - 48);
  const fitScale = Math.max(0.18, Math.min(2.2, availableWidth / baseViewport.width));
  const viewport = page.getViewport({ scale: fitScale * state.zoom });
  const deviceScale = canvasRenderScale(viewport);
  const nextCanvas = document.createElement("canvas");

  nextCanvas.id = "pdfCanvas";
  nextCanvas.width = Math.floor(viewport.width * deviceScale);
  nextCanvas.height = Math.floor(viewport.height * deviceScale);
  nextCanvas.style.width = `${viewport.width}px`;
  nextCanvas.style.height = `${viewport.height}px`;
  dom.pdfCanvas.replaceWith(nextCanvas);
  dom.pdfCanvas = nextCanvas;

  dom.pdfPage.style.width = `${viewport.width}px`;
  dom.pdfPage.style.height = `${viewport.height}px`;
  dom.markerLayer.style.width = `${viewport.width}px`;
  dom.markerLayer.style.height = `${viewport.height}px`;

  const context = nextCanvas.getContext("2d");
  context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
  const renderTask = page.render({ canvasContext: context, viewport });
  renderTask.promise.catch((error) => {
    if (token === state.renderToken) {
      console.error(error);
    }
  });

  if (token !== state.renderToken) return;

  renderMarkers(viewport, baseViewport);
  updatePdfControls();

  if (options.scrollToMarker && state.markers.length > 0) {
    requestAnimationFrame(scrollToFirstMarker);
  }
}

function renderMarkers(viewport, baseViewport) {
  const pageMarkers = state.markers.filter((marker) => marker.page === state.currentPage);

  if (pageMarkers.length === 0) {
    dom.markerLayer.innerHTML = "";
    return;
  }

  dom.markerLayer.innerHTML = pageMarkers
    .map((marker) => {
      const markerRect = markerHighlightRect(convertMarkerToViewportRect(marker, viewport, baseViewport));

      return `
        <div
          class="detector-marker"
          data-label="${marker.label}"
          style="
            left: ${markerRect.left}px;
            top: ${markerRect.top}px;
            width: ${markerRect.width}px;
            height: ${markerRect.height}px;
          "
        ></div>
      `;
    })
    .join("");
}

function convertMarkerToViewportRect(marker, viewport, baseViewport) {
  const scaleX = viewport.width / baseViewport.width;
  const scaleY = viewport.height / baseViewport.height;
  const left = marker.xMin * scaleX;
  const top = marker.yMin * scaleY;
  const width = (marker.xMax - marker.xMin) * scaleX;
  const height = (marker.yMax - marker.yMin) * scaleY;

  return { left, top, width, height };
}

function markerHighlightRect(rect, scale = 1) {
  const width = Math.max(24 * scale, rect.width);
  const height = Math.max(14 * scale, rect.height);
  const paddingX = Math.max(14 * scale, width * 0.38);
  const paddingY = Math.max(10 * scale, height * 1.2);

  return {
    left: Math.max(0, rect.left - paddingX),
    top: Math.max(0, rect.top - paddingY),
    width: width + paddingX * 2,
    height: height + paddingY * 2,
  };
}

function sanitizeFileName(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function drawExportMarker(context, marker, rect, scale) {
  const left = rect.left;
  const top = rect.top;
  const width = rect.width;
  const height = rect.height;
  const centerX = left + width / 2;
  const centerY = top + height / 2;
  const radiusX = Math.max(17 * scale, width / 2);
  const radiusY = Math.max(12 * scale, height / 2);
  const lineWidth = Math.max(4, 6 * scale);

  context.save();
  context.fillStyle = "rgba(255, 220, 92, 0.3)";
  context.strokeStyle = "#e86a1c";
  context.lineWidth = lineWidth;
  context.shadowColor = "rgba(232, 106, 28, 0.34)";
  context.shadowBlur = 20 * scale;
  context.beginPath();
  context.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.restore();

  drawExportLabel(context, marker.label, centerX, top + height + 8 * scale, scale);
}

function drawRoundedRect(context, x, y, width, height, radius) {
  if (typeof context.roundRect === "function") {
    context.roundRect(x, y, width, height, radius);
    return;
  }

  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
}

function drawExportLabel(context, label, centerX, y, scale) {
  const fontSize = Math.max(14, 14 * scale);
  const paddingX = 10 * scale;
  const paddingY = 5 * scale;
  const radius = 8 * scale;
  const text = String(label || "");

  context.save();
  context.font = `900 ${fontSize}px "Microsoft JhengHei", "Noto Sans TC", Arial, sans-serif`;
  const textWidth = context.measureText(text).width;
  const labelWidth = textWidth + paddingX * 2;
  const labelHeight = fontSize + paddingY * 2;
  const x = Math.min(Math.max(0, centerX - labelWidth / 2), Math.max(0, context.canvas.width - labelWidth));
  const top = Math.min(Math.max(0, y), Math.max(0, context.canvas.height - labelHeight));

  context.fillStyle = "#c84c0b";
  context.shadowColor = "rgba(74, 30, 11, 0.28)";
  context.shadowBlur = 18 * scale;
  context.beginPath();
  drawRoundedRect(context, x, top, labelWidth, labelHeight, radius);
  context.fill();

  context.shadowColor = "transparent";
  context.fillStyle = "#ffffff";
  context.textBaseline = "middle";
  context.fillText(text, x + paddingX, top + labelHeight / 2);
  context.restore();
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("圖片產生失敗"));
    }, "image/png");
  });
}

function isTouchDevice() {
  return window.matchMedia?.("(pointer: coarse)").matches || navigator.maxTouchPoints > 0 || window.innerWidth <= 960;
}

function isAppleMobile() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

async function createCurrentPageImageFile() {
  if (!state.pdfDoc || state.markers.length === 0) return null;

  const pageMarkers = state.markers.filter((marker) => marker.page === state.currentPage);
  if (pageMarkers.length === 0) {
    setPdfSearchMessage("目前頁面沒有圈選標記，請先切到有標記的頁面。", { error: true });
    return null;
  }

  const page = await state.pdfDoc.getPage(state.currentPage);
  const baseViewport = page.getViewport({ scale: 1 });
  const exportViewport = page.getViewport({ scale: EXPORT_IMAGE_SCALE });
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = Math.floor(exportViewport.width);
  exportCanvas.height = Math.floor(exportViewport.height);
  const context = exportCanvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  await page.render({ canvasContext: context, viewport: exportViewport }).promise;

  pageMarkers.forEach((marker) => {
    const sourceRect = convertMarkerToViewportRect(marker, exportViewport, baseViewport);
    drawExportMarker(context, marker, markerHighlightRect(sourceRect, EXPORT_IMAGE_SCALE), EXPORT_IMAGE_SCALE);
  });

  const file = state.filesById.get(state.selectedFileId);
  const detectors = uniqueDetectors(pageMarkers.map((marker) => marker.normalizedDetector || marker.detector)).join("-");
  const filename = sanitizeFileName(`${file?.building || "fire-map"}-${file?.floor || `page-${state.currentPage}`}-${detectors || "marked"}.png`);
  const blob = await canvasToPngBlob(exportCanvas);

  return {
    blob,
    file: new File([blob], filename, { type: "image/png" }),
    filename,
  };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function closeImageExportDialog() {
  if (!dom.imageExportDialog) return;

  dom.imageExportDialog.classList.add("is-hidden");
  dom.imageExportDialog.setAttribute("aria-hidden", "true");
  if (state.imageExport?.url) {
    URL.revokeObjectURL(state.imageExport.url);
  }
  state.imageExport = null;
  if (dom.imageExportPreview) {
    dom.imageExportPreview.removeAttribute("src");
  }
}

function openImageExportDialog(exported) {
  if (!dom.imageExportDialog || !dom.imageExportPreview) return;

  if (state.imageExport?.url) {
    URL.revokeObjectURL(state.imageExport.url);
  }
  const url = URL.createObjectURL(exported.blob);
  state.imageExport = { ...exported, url };
  dom.imageExportPreview.src = url;
  dom.imageExportDialog.classList.remove("is-hidden");
  dom.imageExportDialog.setAttribute("aria-hidden", "false");
}

async function shareExportedImage(exported) {
  if (!navigator.canShare || !navigator.share || !navigator.canShare({ files: [exported.file] })) {
    return false;
  }

  await navigator.share({
    files: [exported.file],
    title: exported.filename,
    text: "火警探測器圈選圖片",
  });
  return true;
}

async function saveCurrentPageImage() {
  try {
    const exported = await createCurrentPageImageFile();
    if (!exported) return;

    if (isAppleMobile() || isTouchDevice()) {
      openImageExportDialog(exported);
      try {
        if (await shareExportedImage(exported)) {
          setPdfSearchMessage("已開啟分享，可儲存圖片。");
          return;
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          console.warn(error);
        }
      }
      setPdfSearchMessage("圖片已開啟，請用分享或長按儲存。");
      return;
    }

    downloadBlob(exported.blob, exported.filename);
    setPdfSearchMessage(`已儲存 ${exported.filename}。`);
  } catch (error) {
    console.error(error);
    setPdfSearchMessage(error.message || "圖片儲存失敗。", { error: true });
  }
}

function scrollToFirstMarker() {
  const marker = dom.markerLayer.querySelector(".detector-marker");
  if (!marker) return;

  const markerRect = marker.getBoundingClientRect();
  const shellRect = dom.viewerShell.getBoundingClientRect();
  const left = dom.viewerShell.scrollLeft + markerRect.left - shellRect.left - shellRect.width / 2 + markerRect.width / 2;
  const top = dom.viewerShell.scrollTop + markerRect.top - shellRect.top - shellRect.height / 2 + markerRect.height / 2;

  dom.viewerShell.scrollTo({
    left: Math.max(0, left),
    top: Math.max(0, top),
    behavior: "smooth",
  });
}

function updatePdfControls() {
  const hasPdf = Boolean(state.pdfDoc);
  dom.prevPageButton.disabled = !hasPdf || state.currentPage <= 1;
  dom.nextPageButton.disabled = !hasPdf || state.currentPage >= state.currentPageCount;
  dom.zoomOutButton.disabled = !hasPdf || state.zoom <= MIN_ZOOM;
  dom.fitButton.disabled = !hasPdf;
  dom.zoomInButton.disabled = !hasPdf || state.zoom >= MAX_ZOOM;
  dom.clearMarkerButton.disabled = !hasPdf || state.markers.length === 0;
  dom.saveImageButton.disabled = !hasPdf || state.markers.length === 0;
  dom.openPdfButton.disabled = !hasPdf || !state.currentPath;
  dom.pageStatus.textContent = hasPdf ? `${state.currentPage} / ${state.currentPageCount}` : "-";
  dom.zoomStatus.textContent = hasPdf ? zoomPercentText() : "-";
  dom.viewerShell.classList.toggle("is-zoomed", hasPdf && canUseTouchPan());
}

function clampZoom(value) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

function zoomPercentText() {
  return `${Math.round(state.zoom * 100)}%`;
}

function isViewerControlTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(".pdf-search-overlay, input, button, textarea, select, a"));
}

function pointDistance(points) {
  if (points.length < 2) return 0;

  const first = points[0];
  const second = points[1];
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function pointCenter(points) {
  const total = points.reduce(
    (point, touch) => ({
      x: point.x + touch.x,
      y: point.y + touch.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  };
}

function touchPoints(touches) {
  return Array.from(touches, (touch) => ({
    x: touch.clientX,
    y: touch.clientY,
  }));
}

function activePointerPoints() {
  return [...state.activeTouchPointers.values()];
}

function canUseTouchPan() {
  return state.zoom > 1.02;
}

function clampRatio(value) {
  return Math.max(0, Math.min(1, value));
}

function pageFocusRatio(viewportPoint) {
  const pageRect = dom.pdfPage.getBoundingClientRect();
  const point = viewportPoint || {
    x: pageRect.left + pageRect.width / 2,
    y: pageRect.top + pageRect.height / 2,
  };

  return {
    x: clampRatio((point.x - pageRect.left) / Math.max(1, pageRect.width)),
    y: clampRatio((point.y - pageRect.top) / Math.max(1, pageRect.height)),
  };
}

function scrollPageRatioIntoView(ratio, viewportPoint) {
  const shell = dom.viewerShell;
  const shellRect = shell.getBoundingClientRect();
  const pageRect = dom.pdfPage.getBoundingClientRect();
  const point = viewportPoint || {
    x: shellRect.left + shell.clientWidth / 2,
    y: shellRect.top + shell.clientHeight / 2,
  };
  const offsetX = point.x - shellRect.left;
  const offsetY = point.y - shellRect.top;
  const pageLeft = shell.scrollLeft + pageRect.left - shellRect.left;
  const pageTop = shell.scrollTop + pageRect.top - shellRect.top;

  shell.scrollLeft = Math.max(0, pageLeft + pageRect.width * ratio.x - offsetX);
  shell.scrollTop = Math.max(0, pageTop + pageRect.height * ratio.y - offsetY);
}

async function rerenderWithZoom(nextZoom, focusPoint = null, options = {}) {
  const ratio = pageFocusRatio(focusPoint);

  state.zoom = clampZoom(nextZoom);
  await renderCurrentPage({ scrollToMarker: options.scrollToMarker ?? false });

  scrollPageRatioIntoView(ratio, focusPoint);
}

function scheduleWheelZoom(event) {
  if (!state.pdfDoc) return;
  if (isViewerControlTarget(event.target)) return;

  event.preventDefault();
  const factor = event.deltaY < 0 ? 1.14 : 1 / 1.14;
  state.zoom = clampZoom(state.zoom * factor);
  state.wheelZoomFocus = { x: event.clientX, y: event.clientY };

  window.clearTimeout(state.wheelZoomTimer);
  state.wheelZoomTimer = window.setTimeout(() => {
    rerenderWithZoom(state.zoom, state.wheelZoomFocus);
  }, 70);
}

function startPan(event) {
  if (!state.pdfDoc || event.button !== 0) return;
  if (isViewerControlTarget(event.target)) return;

  state.isPanning = true;
  state.panStartX = event.clientX;
  state.panStartY = event.clientY;
  state.panStartLeft = dom.viewerShell.scrollLeft;
  state.panStartTop = dom.viewerShell.scrollTop;
  dom.viewerShell.classList.add("is-panning");
  event.preventDefault();
}

function movePan(event) {
  if (!state.isPanning) return;

  const deltaX = event.clientX - state.panStartX;
  const deltaY = event.clientY - state.panStartY;
  dom.viewerShell.scrollLeft = state.panStartLeft - deltaX;
  dom.viewerShell.scrollTop = state.panStartTop - deltaY;
}

function endPan() {
  if (!state.isPanning) return;

  state.isPanning = false;
  dom.viewerShell.classList.remove("is-panning");
}

function beginTouchZoom(points) {
  const focusPoint = pointCenter(points);
  const pageRect = dom.pdfPage.getBoundingClientRect();
  const originX = Math.max(0, Math.min(pageRect.width, focusPoint.x - pageRect.left));
  const originY = Math.max(0, Math.min(pageRect.height, focusPoint.y - pageRect.top));

  state.isTouchZooming = true;
  state.isTouchPanning = false;
  state.touchPanPointerId = null;
  state.touchStartDistance = pointDistance(points);
  state.touchStartZoom = state.zoom;
  state.touchStartScrollLeft = dom.viewerShell.scrollLeft;
  state.touchStartScrollTop = dom.viewerShell.scrollTop;
  state.touchStartFocusX = focusPoint.x;
  state.touchStartFocusY = focusPoint.y;
  state.touchZoomFocus = focusPoint;
  dom.viewerShell.classList.add("is-panning", "is-touch-zooming");
  dom.pdfPage.style.transformOrigin = `${originX}px ${originY}px`;
  dom.pdfPage.style.willChange = "transform";
}

function previewTouchZoom(points) {
  if (state.touchStartDistance <= 0) return;

  const distance = pointDistance(points);
  const focusPoint = pointCenter(points);
  const nextZoom = clampZoom(state.touchStartZoom * (distance / state.touchStartDistance));
  const previewScale = nextZoom / state.touchStartZoom;
  const deltaX = focusPoint.x - state.touchStartFocusX;
  const deltaY = focusPoint.y - state.touchStartFocusY;

  state.zoom = nextZoom;
  state.touchZoomFocus = focusPoint;
  dom.pdfPage.style.transform = `scale(${previewScale})`;
  dom.viewerShell.scrollLeft = Math.max(0, state.touchStartScrollLeft - deltaX);
  dom.viewerShell.scrollTop = Math.max(0, state.touchStartScrollTop - deltaY);
  updatePdfControls();
}

function resetTouchZoomPreview() {
  window.clearTimeout(state.touchZoomTimer);
  state.touchZoomTimer = null;
  dom.pdfPage.style.transform = "";
  dom.pdfPage.style.transformOrigin = "";
  dom.pdfPage.style.willChange = "";
  dom.viewerShell.classList.remove("is-touch-zooming");
}

function finishTouchZoom() {
  const focusPoint = state.touchZoomFocus;
  state.isTouchZooming = false;
  state.touchStartDistance = 0;
  resetTouchZoomPreview();
  rerenderWithZoom(state.zoom, focusPoint);
}

function startTouchGesture(event) {
  if (!state.pdfDoc) return;
  if (isViewerControlTarget(event.target)) return;

  if (event.touches.length >= 2) {
    const points = touchPoints(event.touches);
    beginTouchZoom(points);
    event.preventDefault();
    return;
  }

  if (event.touches.length === 1 && canUseTouchPan()) {
    const touch = event.touches[0];
    state.isTouchPanning = true;
    state.panStartX = touch.clientX;
    state.panStartY = touch.clientY;
    state.panStartLeft = dom.viewerShell.scrollLeft;
    state.panStartTop = dom.viewerShell.scrollTop;
    dom.viewerShell.classList.add("is-panning");
  }
}

function moveTouchGesture(event) {
  if (!state.pdfDoc) return;

  if (state.isTouchZooming && event.touches.length >= 2) {
    const points = touchPoints(event.touches);
    previewTouchZoom(points);
    event.preventDefault();
    return;
  }

  if (state.isTouchPanning && event.touches.length === 1) {
    const touch = event.touches[0];
    const deltaX = touch.clientX - state.panStartX;
    const deltaY = touch.clientY - state.panStartY;
    dom.viewerShell.scrollLeft = state.panStartLeft - deltaX;
    dom.viewerShell.scrollTop = state.panStartTop - deltaY;
    event.preventDefault();
  }
}

function endTouchGesture(event) {
  if (state.isTouchZooming && event.touches.length < 2) {
    finishTouchZoom();
  }

  if (event.touches.length === 1 && canUseTouchPan()) {
    const touch = event.touches[0];
    state.isTouchPanning = true;
    state.panStartX = touch.clientX;
    state.panStartY = touch.clientY;
    state.panStartLeft = dom.viewerShell.scrollLeft;
    state.panStartTop = dom.viewerShell.scrollTop;
    return;
  }

  state.isTouchPanning = false;
  dom.viewerShell.classList.remove("is-panning");
}

function cancelTouchGesture() {
  resetTouchZoomPreview();
  state.isTouchPanning = false;
  state.isTouchZooming = false;
  state.touchStartDistance = 0;
  state.activeTouchPointers.clear();
  state.touchPanPointerId = null;
  dom.viewerShell.classList.remove("is-panning");
}

function startPointerGesture(event) {
  if (!state.pdfDoc || event.pointerType !== "touch") return;
  if (isViewerControlTarget(event.target)) return;

  state.activeTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  dom.viewerShell.setPointerCapture?.(event.pointerId);

  const points = activePointerPoints();
  if (points.length >= 2) {
    beginTouchZoom(points);
    event.preventDefault();
    return;
  }

  if (points.length === 1 && canUseTouchPan()) {
    state.isTouchPanning = true;
    state.touchPanPointerId = event.pointerId;
    state.panStartX = event.clientX;
    state.panStartY = event.clientY;
    state.panStartLeft = dom.viewerShell.scrollLeft;
    state.panStartTop = dom.viewerShell.scrollTop;
    dom.viewerShell.classList.add("is-panning");
    event.preventDefault();
  }
}

function movePointerGesture(event) {
  if (!state.pdfDoc || event.pointerType !== "touch") return;
  if (!state.activeTouchPointers.has(event.pointerId)) return;

  state.activeTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const points = activePointerPoints();

  if (state.isTouchZooming && points.length >= 2) {
    previewTouchZoom(points);
    event.preventDefault();
    return;
  }

  if (state.isTouchPanning && state.touchPanPointerId === event.pointerId) {
    const deltaX = event.clientX - state.panStartX;
    const deltaY = event.clientY - state.panStartY;
    dom.viewerShell.scrollLeft = state.panStartLeft - deltaX;
    dom.viewerShell.scrollTop = state.panStartTop - deltaY;
    event.preventDefault();
  }
}

function endPointerGesture(event) {
  if (event.pointerType !== "touch") return;

  state.activeTouchPointers.delete(event.pointerId);
  if (dom.viewerShell.hasPointerCapture?.(event.pointerId)) {
    dom.viewerShell.releasePointerCapture(event.pointerId);
  }

  const points = activePointerPoints();
  if (state.isTouchZooming && points.length < 2) {
    finishTouchZoom();
  }

  if (points.length === 1 && canUseTouchPan()) {
    const [point] = points;
    state.isTouchPanning = true;
    state.touchPanPointerId = state.activeTouchPointers.keys().next().value;
    state.panStartX = point.x;
    state.panStartY = point.y;
    state.panStartLeft = dom.viewerShell.scrollLeft;
    state.panStartTop = dom.viewerShell.scrollTop;
    return;
  }

  state.isTouchPanning = false;
  state.touchPanPointerId = null;
  dom.viewerShell.classList.remove("is-panning");
}

dom.searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  tokenInputs.global.commit();
  blurActiveFormControl(event.currentTarget);
  handleSearch(tokenInputs.global.getText(), tokenInputs.global.getDetectors());
});

dom.pdfSearchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  tokenInputs.pdf.commit();
  blurActiveFormControl(event.currentTarget);
  handleCurrentPdfSearch(tokenInputs.pdf.getText(), tokenInputs.pdf.getDetectors());
});

dom.pdfSearchOverlayForm.addEventListener("submit", (event) => {
  event.preventDefault();
  tokenInputs.overlay.commit();
  blurActiveFormControl(event.currentTarget);
  handleCurrentPdfSearch(tokenInputs.overlay.getText(), tokenInputs.overlay.getDetectors());
});

dom.pdfSearchOverlayClose.addEventListener("click", hidePdfSearchOverlay);

dom.prevPageButton.addEventListener("click", () => {
  if (state.currentPage <= 1) return;
  state.currentPage -= 1;
  renderCurrentPage();
});

dom.nextPageButton.addEventListener("click", () => {
  if (state.currentPage >= state.currentPageCount) return;
  state.currentPage += 1;
  renderCurrentPage();
});

dom.zoomOutButton.addEventListener("click", () => rerenderWithZoom(state.zoom / 1.18));
dom.zoomInButton.addEventListener("click", () => rerenderWithZoom(state.zoom * 1.18));
dom.fitButton.addEventListener("click", () => rerenderWithZoom(1));

dom.viewerShell.addEventListener("wheel", scheduleWheelZoom, { passive: false });
dom.viewerShell.addEventListener("mousedown", startPan);
if (window.TouchEvent) {
  dom.viewerShell.addEventListener("touchstart", startTouchGesture, { passive: false });
  dom.viewerShell.addEventListener("touchmove", moveTouchGesture, { passive: false });
  dom.viewerShell.addEventListener("touchend", endTouchGesture, { passive: false });
  dom.viewerShell.addEventListener("touchcancel", cancelTouchGesture, { passive: false });
} else if (window.PointerEvent) {
  dom.viewerShell.addEventListener("pointerdown", startPointerGesture, { passive: false });
  dom.viewerShell.addEventListener("pointermove", movePointerGesture, { passive: false });
  dom.viewerShell.addEventListener("pointerup", endPointerGesture, { passive: false });
  dom.viewerShell.addEventListener("pointercancel", cancelTouchGesture, { passive: false });
}
window.addEventListener("mousemove", movePan);
window.addEventListener("mouseup", endPan);

dom.markerLayer.addEventListener("dblclick", (event) => {
  if (!event.target.closest(".detector-marker")) return;

  event.preventDefault();
  event.stopPropagation();
  rerenderWithZoom(state.zoom * 1.6, { x: event.clientX, y: event.clientY });
});

dom.clearMarkerButton.addEventListener("click", () => {
  state.markers = [];
  state.selectedResultId = null;
  dom.markerLayer.innerHTML = "";
  updatePdfControls();
  dom.resultsList.querySelectorAll(".result-item").forEach((button) => button.classList.remove("is-active"));
});

dom.saveImageButton.addEventListener("click", saveCurrentPageImage);

dom.imageExportShare.addEventListener("click", async () => {
  if (!state.imageExport) return;

  try {
    if (await shareExportedImage(state.imageExport)) {
      setPdfSearchMessage("已開啟分享，可儲存圖片。");
      return;
    }
    setPdfSearchMessage("此瀏覽器不支援直接分享圖片。", { error: true });
  } catch (error) {
    if (error.name !== "AbortError") {
      console.error(error);
      setPdfSearchMessage("分享圖片失敗。", { error: true });
    }
  }
});

dom.imageExportDownload.addEventListener("click", () => {
  if (!state.imageExport) return;

  downloadBlob(state.imageExport.blob, state.imageExport.filename);
  setPdfSearchMessage(`已下載 ${state.imageExport.filename}。`);
});

dom.imageExportClose.addEventListener("click", closeImageExportDialog);
dom.imageExportBackdrop.addEventListener("click", closeImageExportDialog);

dom.openPdfButton.addEventListener("click", () => {
  if (state.currentPath) {
    window.open(resourceUrl(state.currentPath), "_blank", "noopener");
  }
});

window.addEventListener("resize", () => {
  if (state.pdfDoc) {
    renderCurrentPage();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeImageExportDialog();
  }
});

init();
