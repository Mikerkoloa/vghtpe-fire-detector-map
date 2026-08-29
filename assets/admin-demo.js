const dom = {
  loginPanel: document.querySelector("#loginPanel"),
  loginForm: document.querySelector("#loginForm"),
  dashboard: document.querySelector("#dashboard"),
  navButtons: [...document.querySelectorAll("[data-panel]")],
  panels: [...document.querySelectorAll(".work-area")],
  statusArea: document.querySelector("#statusArea"),
  buildingSelect: document.querySelector("#buildingSelect"),
  floorSelect: document.querySelector("#floorSelect"),
  branchInput: document.querySelector("#branchInput"),
  commitInput: document.querySelector("#commitInput"),
  updatedAtInput: document.querySelector("#updatedAtInput"),
  updatedByInput: document.querySelector("#updatedByInput"),
  updateNoteInput: document.querySelector("#updateNoteInput"),
  fileInput: document.querySelector("#fileInput"),
  fileSummary: document.querySelector("#fileSummary"),
  dropZone: document.querySelector("#dropZone"),
  githubPath: document.querySelector("#githubPath"),
  formState: document.querySelector("#formState"),
  checkFile: document.querySelector("#checkFile"),
  checkTarget: document.querySelector("#checkTarget"),
  checkUpdate: document.querySelector("#checkUpdate"),
  preflightButton: document.querySelector("#preflightButton"),
  uploadForm: document.querySelector("#uploadForm"),
  pipeline: document.querySelector("#pipeline"),
  historyBody: document.querySelector("#historyBody"),
  pdfListSearch: document.querySelector("#pdfListSearch"),
  pdfListBuildingFilter: document.querySelector("#pdfListBuildingFilter"),
  pdfListCount: document.querySelector("#pdfListCount"),
  pdfListBody: document.querySelector("#pdfListBody"),
};

const state = {
  buildings: [],
  pdfItems: [],
  historyByPath: new Map(),
  file: null,
};

const pipelineSteps = ["upload", "github", "index", "commit", "deploy"];

function normalizeFileSize(size) {
  if (!size) return "-";
  const mb = size / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  return `${Math.ceil(size / 1024)} KB`;
}

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function selectedBuilding() {
  return state.buildings.find((building) => building.name === dom.buildingSelect.value);
}

function selectedFloor() {
  const building = selectedBuilding();
  if (!building) return null;
  return building.floors.find((floor) => floor.label === dom.floorSelect.value);
}

function buildGithubPath() {
  const building = selectedBuilding();
  const floor = selectedFloor();

  if (!building || !floor) return "尚未選擇棟別與樓層";
  if (floor.path) return floor.path;

  return `火警圖 PDF/${building.name}火警圖PDF/${building.name}${floor.label} 火警圖.pdf`;
}

function selectedHistory() {
  return state.historyByPath.get(buildGithubPath()) || null;
}

function updateHistoryPreview() {
  const date = dom.updatedAtInput.value || todayString();
  const by = dom.updatedByInput.value.trim() || "admin";
  const note = dom.updateNoteInput.value.trim() || "未填寫備註";
  dom.checkUpdate.textContent = `${date}，${by}，${note}`;
}

function syncUpdateFieldsFromHistory() {
  const history = selectedHistory();
  dom.updatedAtInput.value = history?.latestUpdatedAt || todayString();
  dom.updatedByInput.value = history?.updatedBy || "admin";
  dom.updateNoteInput.value = history?.note || "";
  updateHistoryPreview();
}

function updatePreview() {
  const building = selectedBuilding();
  const floor = selectedFloor();
  const mode = new FormData(dom.uploadForm).get("mode");
  const targetText = building && floor ? `${building.name} ${floor.label}` : "等待選擇";

  dom.githubPath.textContent = buildGithubPath();
  dom.checkTarget.textContent = targetText;
  updateHistoryPreview();

  if (state.file) {
    dom.formState.textContent = mode === "replace" ? "準備取代圖面" : "準備新增圖面";
    dom.formState.classList.add("is-ready");
    dom.fileSummary.textContent = `${state.file.name}，${normalizeFileSize(state.file.size)}`;
    dom.checkFile.textContent = `${state.file.name}，${normalizeFileSize(state.file.size)}`;
    return;
  }

  dom.formState.textContent = "尚未選擇檔案";
  dom.formState.classList.remove("is-ready");
  dom.fileSummary.textContent = "只接受 PDF，正式版上傳後會重建索引";
  dom.checkFile.textContent = "等待選擇";
}

function fillFloors() {
  const building = selectedBuilding();
  dom.floorSelect.innerHTML = "";
  if (!building) return;

  building.floors.forEach((floor) => {
    const option = document.createElement("option");
    option.value = floor.label;
    option.textContent = floor.label;
    dom.floorSelect.append(option);
  });

  syncUpdateFieldsFromHistory();
  updatePreview();
}

function fillBuildings(buildings) {
  dom.buildingSelect.innerHTML = "";
  buildings.forEach((building) => {
    const option = document.createElement("option");
    option.value = building.name;
    option.textContent = building.name;
    dom.buildingSelect.append(option);
  });

  fillFloors();
}

function flattenPdfItems(buildings) {
  return buildings.flatMap((building) =>
    building.floors.map((floor) => {
      const itemPath = floor.path || buildFallbackPath(building.name, floor.label);
      const history = state.historyByPath.get(itemPath);

      return {
        building: building.name,
        floor: floor.label,
        path: itemPath,
        detectorCount: floor.detectorCount || history?.detectorCount || 0,
        pageCount: floor.pageCount || history?.pageCount || 0,
        latestUpdatedAt: history?.latestUpdatedAt || "",
        updatedBy: history?.updatedBy || "",
        note: history?.note || "",
        history: history?.history || [],
      };
    })
  );
}

function buildHistoryMap(historyData) {
  return new Map((historyData.files || []).map((item) => [item.path, item]));
}

function buildFallbackPath(buildingName, floorLabel) {
  return `火警圖 PDF/${buildingName}火警圖PDF/${buildingName}${floorLabel} 火警圖.pdf`;
}

function fillPdfBuildingFilter(buildings) {
  dom.pdfListBuildingFilter.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "全部棟別";
  dom.pdfListBuildingFilter.append(allOption);

  buildings.forEach((building) => {
    const option = document.createElement("option");
    option.value = building.name;
    option.textContent = building.name;
    dom.pdfListBuildingFilter.append(option);
  });
}

function filteredPdfItems() {
  const keyword = dom.pdfListSearch.value.trim().toLowerCase();
  const buildingName = dom.pdfListBuildingFilter.value;

  return state.pdfItems.filter((item) => {
    const matchesBuilding = !buildingName || item.building === buildingName;
    const haystack = `${item.building} ${item.floor} ${item.path} ${item.latestUpdatedAt} ${item.updatedBy} ${item.note}`.toLowerCase();
    const matchesKeyword = !keyword || haystack.includes(keyword);
    return matchesBuilding && matchesKeyword;
  });
}

function renderPdfList() {
  const items = filteredPdfItems();
  dom.pdfListCount.textContent = `${items.length} 份 PDF`;
  dom.pdfListBody.innerHTML = "";

  if (items.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td class="empty-row" colspan="9" data-label="">沒有符合的 PDF</td>`;
    dom.pdfListBody.append(row);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td data-label="棟別">${item.building}</td>
      <td data-label="樓層">${item.floor}</td>
      <td data-label="最後更新">${item.latestUpdatedAt || "-"}</td>
      <td data-label="更新人">${item.updatedBy || "-"}</td>
      <td data-label="定址碼">${item.detectorCount}</td>
      <td data-label="頁數">${item.pageCount}</td>
      <td data-label="備註">${item.note || "-"}</td>
      <td data-label="GitHub 路徑"><code>${item.path}</code></td>
      <td data-label="動作"><button class="row-button" type="button" data-update-pdf="${item.building}|${item.floor}">更新</button></td>
    `;
    dom.pdfListBody.append(row);
  });
}

function setFile(file) {
  if (!file) return;

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    dom.fileSummary.textContent = "請選擇 PDF 檔案";
    dom.formState.textContent = "檔案格式不符";
    dom.formState.classList.remove("is-ready");
    return;
  }

  state.file = file;
  updatePreview();
}

function setPipeline(activeIndex) {
  dom.pipeline.querySelectorAll("li").forEach((item, index) => {
    item.classList.toggle("is-done", index < activeIndex);
    item.classList.toggle("is-active", index === activeIndex);
  });
}

function finishPipeline() {
  dom.pipeline.querySelectorAll("li").forEach((item) => {
    item.classList.add("is-done");
    item.classList.remove("is-active");
  });
}

function addHistoryRow() {
  const building = selectedBuilding();
  const floor = selectedFloor();
  const mode = new FormData(dom.uploadForm).get("mode") === "replace" ? "取代 PDF" : "新增 PDF";
  const now = new Date();
  const note = dom.updateNoteInput.value.trim() || "未填寫備註";
  const row = document.createElement("tr");

  row.innerHTML = `
    <td>${now.toLocaleString("zh-TW", { hour12: false })}</td>
    <td>${building ? building.name : "-"} ${floor ? floor.label : ""}</td>
    <td>${mode}</td>
    <td>${note}</td>
    <td>完成</td>
    <td>等待 Vercel</td>
  `;

  dom.historyBody.prepend(row);
}

function updateSelectedPdfHistory() {
  const building = selectedBuilding();
  const floor = selectedFloor();
  if (!building || !floor) return;

  const pdfPath = buildGithubPath();
  const date = dom.updatedAtInput.value || todayString();
  const by = dom.updatedByInput.value.trim() || "admin";
  const note = dom.updateNoteInput.value.trim() || "未填寫備註";
  const mode = new FormData(dom.uploadForm).get("mode");
  const previous = state.historyByPath.get(pdfPath);
  const nextEntry = {
    date,
    action: mode === "replace" ? "replace" : "create",
    by,
    commit: "demo-pending",
    note,
  };

  const nextHistory = {
    building: building.name,
    floor: floor.label,
    path: pdfPath,
    latestUpdatedAt: date,
    updatedBy: by,
    note,
    detectorCount: floor.detectorCount || previous?.detectorCount || 0,
    pageCount: floor.pageCount || previous?.pageCount || 0,
    history: [nextEntry, ...(previous?.history || [])],
  };

  state.historyByPath.set(pdfPath, nextHistory);
  state.pdfItems = flattenPdfItems(state.buildings);
  renderPdfList();
  updatePreview();
}

async function simulateUpload() {
  if (!state.file) {
    dom.fileSummary.textContent = "請先選擇要上傳的 PDF";
    return;
  }

  dom.formState.textContent = "發佈中";
  dom.formState.classList.remove("is-ready");

  for (let index = 0; index < pipelineSteps.length; index += 1) {
    setPipeline(index);
    await new Promise((resolve) => window.setTimeout(resolve, 650));
  }

  finishPipeline();
  dom.formState.textContent = "Demo 發佈完成";
  dom.formState.classList.add("is-ready");
  updateSelectedPdfHistory();
  addHistoryRow();
}

function activatePanel(panelId) {
  dom.navButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.panel === panelId);
  });

  dom.panels.forEach((panel) => {
    panel.classList.toggle("is-hidden", panel.id !== panelId);
  });

  dom.statusArea.classList.toggle("is-hidden", panelId !== "uploadPanel");
}

async function loadBuildings() {
  const [buildingResponse, historyResponse] = await Promise.all([
    fetch("./data/buildings.json"),
    fetch("./data/pdf-update-history.json"),
  ]);

  if (!buildingResponse.ok) throw new Error("buildings.json 載入失敗");

  const data = await buildingResponse.json();
  const historyData = historyResponse.ok ? await historyResponse.json() : { files: [] };
  state.buildings = data.buildings || [];
  state.historyByPath = buildHistoryMap(historyData);
  state.pdfItems = flattenPdfItems(state.buildings);
  fillBuildings(state.buildings);
  fillPdfBuildingFilter(state.buildings);
  renderPdfList();
}

dom.loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  document.activeElement.blur();
  dom.loginPanel.classList.add("is-hidden");
  dom.dashboard.classList.remove("is-hidden");
});

dom.navButtons.forEach((button) => {
  button.addEventListener("click", () => activatePanel(button.dataset.panel));
});

dom.buildingSelect.addEventListener("change", fillFloors);
dom.floorSelect.addEventListener("change", () => {
  syncUpdateFieldsFromHistory();
  updatePreview();
});
dom.uploadForm.addEventListener("change", updatePreview);
dom.updatedAtInput.addEventListener("input", updateHistoryPreview);
dom.updatedByInput.addEventListener("input", updateHistoryPreview);
dom.updateNoteInput.addEventListener("input", updateHistoryPreview);

dom.fileInput.addEventListener("change", () => {
  setFile(dom.fileInput.files[0]);
});

dom.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dom.dropZone.classList.add("is-dragging");
});

dom.dropZone.addEventListener("dragleave", () => {
  dom.dropZone.classList.remove("is-dragging");
});

dom.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dom.dropZone.classList.remove("is-dragging");
  setFile(event.dataTransfer.files[0]);
});

dom.preflightButton.addEventListener("click", () => {
  const building = selectedBuilding();
  const floor = selectedFloor();
  dom.checkTarget.textContent = building && floor ? `${building.name} ${floor.label}，索引將重新產生` : "等待選擇";
});

dom.pdfListSearch.addEventListener("input", renderPdfList);
dom.pdfListBuildingFilter.addEventListener("change", renderPdfList);

dom.pdfListBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-update-pdf]");
  if (!button) return;

  const [buildingName, floorLabel] = button.dataset.updatePdf.split("|");
  dom.buildingSelect.value = buildingName;
  fillFloors();
  dom.floorSelect.value = floorLabel;
  syncUpdateFieldsFromHistory();
  updatePreview();
  activatePanel("uploadPanel");
});

dom.uploadForm.addEventListener("submit", (event) => {
  event.preventDefault();
  document.activeElement.blur();
  simulateUpload();
});

loadBuildings().catch(() => {
  state.buildings = [
    { name: "長青樓", floors: [{ label: "6F" }, { label: "7F" }, { label: "B1F" }] },
    { name: "二門診", floors: [{ label: "1F" }, { label: "7F" }, { label: "8F" }] },
    { name: "思源樓", floors: [{ label: "1F" }, { label: "2F" }, { label: "RF" }] },
  ];
  state.historyByPath = new Map();
  state.pdfItems = flattenPdfItems(state.buildings);
  fillBuildings(state.buildings);
  fillPdfBuildingFilter(state.buildings);
  renderPdfList();
});
