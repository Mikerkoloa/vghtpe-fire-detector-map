import * as pdfjsLib from "./vendor/pdfjs/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.mjs", import.meta.url).href;

const dom = {
  searchForm: document.querySelector("#searchForm"),
  searchInput: document.querySelector("#searchInput"),
  systemStatus: document.querySelector("#systemStatus"),
  buildingCount: document.querySelector("#buildingCount"),
  buildingGroups: document.querySelector("#buildingGroups"),
  selectedBuildingName: document.querySelector("#selectedBuildingName"),
  selectedFloorMeta: document.querySelector("#selectedFloorMeta"),
  floorGrid: document.querySelector("#floorGrid"),
  currentFile: document.querySelector("#currentFile"),
  pdfSearchForm: document.querySelector("#pdfSearchForm"),
  pdfSearchInput: document.querySelector("#pdfSearchInput"),
  pdfSearchMessage: document.querySelector("#pdfSearchMessage"),
  pdfSearchOverlay: document.querySelector("#pdfSearchOverlay"),
  pdfSearchOverlayForm: document.querySelector("#pdfSearchOverlayForm"),
  pdfSearchOverlayInput: document.querySelector("#pdfSearchOverlayInput"),
  pdfSearchOverlayClose: document.querySelector("#pdfSearchOverlayClose"),
  pageStatus: document.querySelector("#pageStatus"),
  prevPageButton: document.querySelector("#prevPageButton"),
  nextPageButton: document.querySelector("#nextPageButton"),
  zoomOutButton: document.querySelector("#zoomOutButton"),
  fitButton: document.querySelector("#fitButton"),
  zoomInButton: document.querySelector("#zoomInButton"),
  clearMarkerButton: document.querySelector("#clearMarkerButton"),
  openPdfButton: document.querySelector("#openPdfButton"),
  viewerShell: document.querySelector("#viewerShell"),
  emptyState: document.querySelector("#emptyState"),
  pdfPage: document.querySelector("#pdfPage"),
  pdfCanvas: document.querySelector("#pdfCanvas"),
  markerLayer: document.querySelector("#markerLayer"),
  resultCount: document.querySelector("#resultCount"),
  resultSummary: document.querySelector("#resultSummary"),
  resultsList: document.querySelector("#resultsList"),
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
};

const MIN_ZOOM = 0.45;
const MAX_ZOOM = 4;

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[－–—]/g, "-")
    .replace(/[：]/g, ":")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function resourceUrl(relativePath) {
  return relativePath.split("/").map((part) => encodeURIComponent(part)).join("/");
}

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

function setStatus(message) {
  dom.systemStatus.textContent = message;
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

function parseQuery(query) {
  const normalized = normalizeText(query);
  const buildings = [...state.buildingsByName.keys()].sort((left, right) => right.length - left.length);
  const building = buildings.find((name) => normalized.includes(normalizeText(name))) || null;
  const detectorMatch = normalized.match(/(?:\d+:)?(M\d+-\d+)/);
  const detector = detectorMatch ? detectorMatch[1] : null;
  const candidateFloors = building
    ? state.buildingsByName.get(building).floors.map((floor) => floor.label)
    : [...new Set(state.index.files.map((file) => file.floor))];
  const floor = candidateFloors
    .sort((left, right) => normalizeText(right).length - normalizeText(left).length)
    .find((label) => normalized.includes(normalizeText(label))) || null;

  return { query, normalized, building, floor, detector };
}

function handleSearch(query) {
  if (!state.index || !state.buildingData) {
    renderResults([], "索引載入中，請稍候再搜尋。");
    return;
  }

  const trimmed = query.trim();
  if (!trimmed) {
    renderResults([], "請輸入探測器編號、棟別或樓層。");
    return;
  }

  const parsed = parseQuery(trimmed);

  if (parsed.building) {
    selectBuilding(parsed.building, { openFirstFloor: false });
  }

  if (!parsed.detector) {
    handleNavigationSearch(parsed);
    return;
  }

  const results = searchDetector(parsed);

  if (parsed.building && parsed.floor && results.length > 0) {
    openResult(results[0]);
    renderResults(results, `已找到 ${results.length} 筆符合 ${parsed.detector} 的位置，並開啟第一筆。`);
    return;
  }

  renderResults(results, buildResultSummary(parsed, results.length));
}

function handleNavigationSearch(parsed) {
  if (parsed.building && parsed.floor) {
    const building = state.buildingsByName.get(parsed.building);
    const floor = building.floors.find((candidate) => normalizeText(candidate.label) === normalizeText(parsed.floor));
    if (floor) {
      openFile(floor.fileId, { markers: [] });
      renderResults([], `已開啟 ${parsed.building} ${floor.label}。`);
      return;
    }
  }

  if (parsed.building) {
    renderResults([], `已切換到 ${parsed.building}，請選擇樓層或輸入探測器編號。`);
    return;
  }

  renderResults([], "沒有偵測到探測器編號，請輸入例如 M1-66。");
}

function searchDetector(parsed) {
  const buildingOrder = new Map(state.buildingData.buildings.map((building, index) => [building.name, index]));

  return state.index.entries
    .filter((entry) => entry.normalizedDetector === parsed.detector)
    .filter((entry) => !parsed.building || entry.building === parsed.building)
    .filter((entry) => !parsed.floor || normalizeText(entry.floor) === normalizeText(parsed.floor))
    .sort((left, right) => {
      const buildingDelta = (buildingOrder.get(left.building) ?? 999) - (buildingOrder.get(right.building) ?? 999);
      if (buildingDelta) return buildingDelta;
      const floorDelta = floorSortValue(right.floor) - floorSortValue(left.floor);
      if (floorDelta) return floorDelta;
      return left.label.localeCompare(right.label, "zh-Hant");
    });
}

function buildResultSummary(parsed, count) {
  if (count === 0) {
    const scope = [parsed.building, parsed.floor].filter(Boolean).join(" ");
    return scope ? `${scope} 找不到 ${parsed.detector}。` : `找不到 ${parsed.detector}。`;
  }

  if (parsed.building) {
    return `找到 ${count} 筆 ${parsed.building} 內的 ${parsed.detector}，請選擇棟別與樓層後查看。`;
  }

  return `找到 ${count} 筆 ${parsed.detector}，請選擇要查看的位置。`;
}

function renderResults(results, summary) {
  dom.resultCount.textContent = `${results.length} 筆`;
  dom.resultSummary.textContent = summary;

  if (results.length === 0) {
    dom.resultsList.innerHTML = `<div class="message">${summary}</div>`;
    return;
  }

  const visibleResults = results.slice(0, 160);
  dom.resultsList.innerHTML = visibleResults
    .map((entry) => `
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
    `)
    .join("");

  if (results.length > visibleResults.length) {
    const message = document.createElement("div");
    message.className = "message";
    message.textContent = `還有 ${results.length - visibleResults.length} 筆未顯示，請增加棟別或樓層條件。`;
    dom.resultsList.append(message);
  }

  dom.resultsList.querySelectorAll("[data-entry-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const entry = state.index.entries.find((candidate) => candidate.id === button.dataset.entryId);
      if (entry) openResult(entry);
    });
  });
}

function openResult(entry) {
  state.selectedResultId = entry.id;
  selectBuilding(entry.building, { openFirstFloor: false });
  openFile(entry.fileId, { page: entry.page, markers: [entry] });

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
  if (dom.pdfSearchInput) {
    dom.pdfSearchInput.value = "";
  }
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
  if (dom.pdfSearchOverlayInput) {
    dom.pdfSearchOverlayInput.value = "";
    requestAnimationFrame(() => dom.pdfSearchOverlayInput.focus());
  }
}

function hidePdfSearchOverlay() {
  if (dom.pdfSearchOverlay) {
    dom.pdfSearchOverlay.classList.add("is-hidden");
  }
}

async function handleCurrentPdfSearch(rawQuery) {
  if (!state.index || !state.selectedFileId) {
    setPdfSearchMessage("請先開啟一張 PDF 圖面。", { error: true });
    return;
  }

  const normalized = normalizeText(rawQuery);
  const detectorMatch = normalized.match(/(?:\d+:)?(M\d+-\d+)/);
  const detector = detectorMatch ? detectorMatch[1] : null;
  const file = state.filesById.get(state.selectedFileId);

  if (!detector) {
    setPdfSearchMessage("請輸入定址碼，例如 M1-75。", { error: true });
    return;
  }

  const results = state.index.entries
    .filter((entry) => entry.fileId === state.selectedFileId)
    .filter((entry) => entry.normalizedDetector === detector)
    .sort((left, right) => left.page - right.page || left.label.localeCompare(right.label, "zh-Hant"));

  if (results.length === 0) {
    state.markers = [];
    state.selectedResultId = null;
    dom.markerLayer.innerHTML = "";
    updatePdfControls();
    setPdfSearchMessage(`此圖面找不到 ${detector}。`, { error: true });
    renderResults([], `${file.building} ${file.floor} 找不到 ${detector}。`);
    return;
  }

  const firstResult = results[0];
  state.selectedResultId = firstResult.id;
  state.markers = [firstResult];
  state.currentPage = firstResult.page;
  hidePdfSearchOverlay();
  if (dom.pdfSearchInput) {
    dom.pdfSearchInput.value = detector;
  }
  if (dom.pdfSearchOverlayInput) {
    dom.pdfSearchOverlayInput.value = detector;
  }

  renderResults(results, `目前圖面找到 ${results.length} 筆 ${detector}，已圈選第一筆。`);
  await renderCurrentPage({ scrollToMarker: true });
  setPdfSearchMessage(`已定位 ${firstResult.label}。`);
}

async function renderCurrentPage(options = {}) {
  if (!state.pdfDoc) return;

  const token = ++state.renderToken;
  const page = await state.pdfDoc.getPage(state.currentPage);
  const baseViewport = page.getViewport({ scale: 1 });
  const availableWidth = Math.max(320, dom.viewerShell.clientWidth - 48);
  const fitScale = Math.max(0.18, Math.min(2.2, availableWidth / baseViewport.width));
  const viewport = page.getViewport({ scale: fitScale * state.zoom });
  const deviceScale = window.devicePixelRatio || 1;
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
      const markerRect = convertMarkerToViewportRect(marker, viewport, baseViewport);
      const left = markerRect.left;
      const top = markerRect.top;
      const width = Math.max(24, markerRect.width);
      const height = Math.max(14, markerRect.height);
      const paddingX = Math.max(14, width * 0.38);
      const paddingY = Math.max(10, height * 1.2);

      return `
        <div
          class="detector-marker"
          data-label="${marker.label}"
          style="
            left: ${Math.max(0, left - paddingX)}px;
            top: ${Math.max(0, top - paddingY)}px;
            width: ${width + paddingX * 2}px;
            height: ${height + paddingY * 2}px;
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
  dom.zoomOutButton.disabled = !hasPdf || state.zoom <= 0.45;
  dom.fitButton.disabled = !hasPdf;
  dom.zoomInButton.disabled = !hasPdf || state.zoom >= 4;
  dom.clearMarkerButton.disabled = !hasPdf || state.markers.length === 0;
  dom.openPdfButton.disabled = !hasPdf || !state.currentPath;
  dom.pageStatus.textContent = hasPdf ? `${state.currentPage} / ${state.currentPageCount}` : "-";
}

function clampZoom(value) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

async function rerenderWithZoom(nextZoom, focusPoint = null, options = {}) {
  const shell = dom.viewerShell;
  const previousWidth = Math.max(1, shell.scrollWidth);
  const previousHeight = Math.max(1, shell.scrollHeight);
  const viewportPoint = focusPoint || {
    x: shell.getBoundingClientRect().left + shell.clientWidth / 2,
    y: shell.getBoundingClientRect().top + shell.clientHeight / 2,
  };
  const shellRect = shell.getBoundingClientRect();
  const offsetX = viewportPoint.x - shellRect.left;
  const offsetY = viewportPoint.y - shellRect.top;
  const contentX = shell.scrollLeft + offsetX;
  const contentY = shell.scrollTop + offsetY;

  state.zoom = clampZoom(nextZoom);
  await renderCurrentPage({ scrollToMarker: options.scrollToMarker ?? false });

  const widthRatio = shell.scrollWidth / previousWidth;
  const heightRatio = shell.scrollHeight / previousHeight;
  shell.scrollLeft = Math.max(0, contentX * widthRatio - offsetX);
  shell.scrollTop = Math.max(0, contentY * heightRatio - offsetY);
}

function scheduleWheelZoom(event) {
  if (!state.pdfDoc) return;
  if (event.target.closest(".pdf-search-overlay, input, button, textarea, select")) return;

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
  if (event.target.closest(".pdf-search-overlay, input, button, textarea, select")) return;

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

dom.searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  handleSearch(dom.searchInput.value);
});

dom.pdfSearchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  handleCurrentPdfSearch(dom.pdfSearchInput.value);
});

dom.pdfSearchOverlayForm.addEventListener("submit", (event) => {
  event.preventDefault();
  handleCurrentPdfSearch(dom.pdfSearchOverlayInput.value);
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

init();
