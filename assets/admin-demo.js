const dom = {
  loginPanel: document.querySelector("#loginPanel"),
  loginForm: document.querySelector("#loginForm"),
  usernameInput: document.querySelector("#usernameInput"),
  passwordInput: document.querySelector("#passwordInput"),
  loginMessage: document.querySelector("#loginMessage"),
  dashboard: document.querySelector("#dashboard"),
  navButtons: [...document.querySelectorAll("[data-panel]")],
  panels: [...document.querySelectorAll(".work-area")],
  statusArea: document.querySelector("#statusArea"),
  modeInputs: [...document.querySelectorAll('input[name="mode"]')],
  buildingSelect: document.querySelector("#buildingSelect"),
  floorSelect: document.querySelector("#floorSelect"),
  buildingOptions: document.querySelector("#buildingOptions"),
  newBuildingInput: document.querySelector("#newBuildingInput"),
  newFloorInput: document.querySelector("#newFloorInput"),
  replaceFields: [...document.querySelectorAll(".replace-field")],
  createFields: [...document.querySelectorAll(".create-field")],
  branchInput: document.querySelector("#branchInput"),
  commitInput: document.querySelector("#commitInput"),
  updatedAtInput: document.querySelector("#updatedAtInput"),
  updatedByInput: document.querySelector("#updatedByInput"),
  updateNoteInput: document.querySelector("#updateNoteInput"),
  fileInput: document.querySelector("#fileInput"),
  fileSummary: document.querySelector("#fileSummary"),
  dropZone: document.querySelector("#dropZone"),
  githubPath: document.querySelector("#githubPath"),
  apiMessage: document.querySelector("#apiMessage"),
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
  lastPreflight: null,
  authToken: window.sessionStorage.getItem("adminDemoToken") || "",
};

const pipelineSteps = ["upload", "github", "index", "commit", "deploy"];

function clearAdminData() {
  state.buildings = [];
  state.pdfItems = [];
  state.historyByPath = new Map();
  dom.buildingSelect.innerHTML = "";
  dom.floorSelect.innerHTML = "";
  dom.buildingOptions.innerHTML = "";
  dom.newBuildingInput.value = "";
  dom.newFloorInput.value = "";
  dom.pdfListBuildingFilter.innerHTML = "";
  dom.pdfListCount.textContent = "尚未登入";
  dom.pdfListBody.innerHTML = `<tr><td class="empty-row" colspan="9" data-label="">登入後載入 PDF 清單</td></tr>`;
  dom.githubPath.textContent = "登入後載入資料";
  dom.checkTarget.textContent = "登入後載入資料";
}

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

function selectedMode() {
  return new FormData(dom.uploadForm).get("mode") === "create" ? "create" : "replace";
}

function isCreateMode() {
  return selectedMode() === "create";
}

function normalizeText(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

function normalizeFloorLabel(value) {
  return normalizeText(value).replace(/\s+/g, "").replace(/～/g, "~").toUpperCase();
}

function selectedFloor() {
  const building = selectedBuilding();
  if (!building) return null;
  return building.floors.find((floor) => floor.label === dom.floorSelect.value);
}

function buildingNameForPayload() {
  if (!isCreateMode()) return dom.buildingSelect.value;
  return normalizeText(dom.newBuildingInput.value) || dom.buildingSelect.value;
}

function floorLabelForPayload() {
  if (!isCreateMode()) return dom.floorSelect.value;
  return normalizeFloorLabel(dom.newFloorInput.value);
}

function existingTarget(buildingName = buildingNameForPayload(), floorLabel = floorLabelForPayload()) {
  const building = state.buildings.find((item) => item.name === buildingName);
  const floor = building?.floors.find((item) => item.label === floorLabel);
  return {
    building,
    floor,
    exists: Boolean(floor?.path),
  };
}

function buildGithubPath() {
  if (isCreateMode()) {
    const buildingName = buildingNameForPayload();
    const floorLabel = floorLabelForPayload();

    if (!buildingName || !floorLabel) return "請輸入新增棟別與樓層";
    return buildFallbackPath(buildingName, floorLabel);
  }

  const building = selectedBuilding();
  const floor = selectedFloor();

  if (!building || !floor) return "尚未選擇棟別與樓層";
  return floor.path || buildFallbackPath(building.name, floor.label);
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
  const mode = selectedMode();
  const buildingName = buildingNameForPayload();
  const floorLabel = floorLabelForPayload();
  const target = existingTarget(buildingName, floorLabel);
  const targetText = buildingName && floorLabel ? `${buildingName} ${floorLabel}` : "等待選擇";

  dom.githubPath.textContent = buildGithubPath();
  dom.checkTarget.textContent = mode === "create" && target.exists ? `${targetText} 已存在，請改用取代` : targetText;
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
  dom.buildingOptions.innerHTML = "";
  buildings.forEach((building) => {
    const option = document.createElement("option");
    option.value = building.name;
    option.textContent = building.name;
    dom.buildingSelect.append(option);

    const dataOption = document.createElement("option");
    dataOption.value = building.name;
    dom.buildingOptions.append(dataOption);
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
  const files = Array.isArray(historyData) ? historyData : historyData.files || [];
  return new Map(files.map((item) => [item.path, item]));
}

function buildFallbackPath(buildingName, floorLabel) {
  return `火警圖 PDF/${buildingName}/${buildingName}${floorLabel} 火警圖.pdf`;
}

function syncModeFields() {
  const createMode = isCreateMode();
  dom.createFields.forEach((field) => field.classList.toggle("is-hidden", !createMode));
  dom.replaceFields.forEach((field) => field.classList.toggle("is-hidden", createMode));
  dom.floorSelect.disabled = createMode;
  dom.newBuildingInput.disabled = !createMode;
  dom.newFloorInput.disabled = !createMode;

  if (createMode && !dom.newBuildingInput.value.trim()) {
    dom.newBuildingInput.value = dom.buildingSelect.value;
  }
}

function setApiMessage(message, tone = "") {
  dom.apiMessage.textContent = message;
  dom.apiMessage.classList.toggle("is-ok", tone === "ok");
  dom.apiMessage.classList.toggle("is-warning", tone === "warning");
  dom.apiMessage.classList.toggle("is-error", tone === "error");
}

function setLoginMessage(message, tone = "") {
  dom.loginMessage.textContent = message;
  dom.loginMessage.classList.toggle("is-ok", tone === "ok");
  dom.loginMessage.classList.toggle("is-warning", tone === "warning");
  dom.loginMessage.classList.toggle("is-error", tone === "error");
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",").pop() : result);
    });
    reader.addEventListener("error", () => reject(reader.error || new Error("PDF 讀取失敗")));
    reader.readAsDataURL(file);
  });
}

async function buildUploadPayload({ includeContent = false } = {}) {
  const file = state.file
    ? {
        name: state.file.name,
        size: state.file.size,
        type: state.file.type || "application/pdf",
        lastModified: state.file.lastModified,
      }
    : null;

  if (file && includeContent) {
    file.contentBase64 = await readFileAsBase64(state.file);
  }

  return {
    mode: selectedMode(),
    building: buildingNameForPayload(),
    floor: floorLabelForPayload(),
    path: buildGithubPath(),
    branch: dom.branchInput.value.trim() || "main",
    commitMessage: dom.commitInput.value.trim(),
    updatedAt: dom.updatedAtInput.value || todayString(),
    updatedBy: dom.updatedByInput.value.trim(),
    note: dom.updateNoteInput.value.trim(),
    file,
  };
}

async function requestAdminApi(action, payload) {
  const headers = payload ? { "content-type": "application/json" } : {};
  if (state.authToken) {
    headers.authorization = `Bearer ${state.authToken}`;
  }

  const options = payload
    ? {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }
    : {
        headers,
      };
  const response = await fetch(`/api/admin/${action}`, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = data.detail ? `：${data.detail}` : "";
    const message = data.errors?.join("、") || `${data.error || "管理 API 執行失敗"}${detail}`;
    throw new Error(message);
  }

  return data;
}

function applyPreflightResult(result) {
  state.lastPreflight = result;

  const checks = new Map((result.checks || []).map((check) => [check.id, check]));
  dom.checkFile.textContent = checks.get("file")?.message || "等待選擇";
  dom.checkTarget.textContent = checks.get("target")?.message || "等待選擇";

  const date = dom.updatedAtInput.value || todayString();
  const by = dom.updatedByInput.value.trim() || "admin";
  const note = dom.updateNoteInput.value.trim() || "未填寫備註";
  dom.checkUpdate.textContent = `${date}，${by}，${note}`;

  if (result.ok) {
    const warningText = result.warnings?.length ? `，提醒：${result.warnings.join("、")}` : "";
    setApiMessage(`預檢通過：${result.target.building} ${result.target.floor}${warningText}`, result.warnings?.length ? "warning" : "ok");
    dom.formState.textContent = "預檢通過";
    dom.formState.classList.add("is-ready");
    return true;
  }

  setApiMessage(`預檢未通過：${(result.errors || []).join("、")}`, "error");
  dom.formState.textContent = "預檢未通過";
  dom.formState.classList.remove("is-ready");
  return false;
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

  state.lastPreflight = null;

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    state.file = null;
    dom.fileSummary.textContent = "請選擇 PDF 檔案";
    dom.formState.textContent = "檔案格式不符";
    dom.formState.classList.remove("is-ready");
    setApiMessage("檔案格式不符，請選擇 PDF。", "error");
    return;
  }

  state.file = file;
  setApiMessage("已選擇 PDF，可先執行檢查索引。", "warning");
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

function applyPipelineStatuses(steps) {
  const firstPendingIndex = steps.findIndex((step) => step.status === "pending" || step.status === "mock");
  const activeStep = firstPendingIndex === -1 ? "" : steps[firstPendingIndex].id;
  const statuses = new Map(steps.map((step) => [step.id, step.status]));

  dom.pipeline.querySelectorAll("li").forEach((item) => {
    const status = statuses.get(item.dataset.step);
    item.classList.toggle("is-done", status === "done");
    item.classList.toggle("is-active", item.dataset.step === activeStep);
  });
}

function addHistoryRow(uploadResult) {
  const buildingName = buildingNameForPayload();
  const floorLabel = floorLabelForPayload();
  const mode = selectedMode() === "replace" ? "取代 PDF" : "新增 PDF";
  const now = new Date();
  const note = dom.updateNoteInput.value.trim() || "未填寫備註";
  const commitLabel = uploadResult?.commit?.sha ? uploadResult.commit.sha.slice(0, 12) : "等待 Vercel";
  const row = document.createElement("tr");

  row.innerHTML = `
    <td>${now.toLocaleString("zh-TW", { hour12: false })}</td>
    <td>${buildingName || "-"} ${floorLabel || ""}</td>
    <td>${mode}</td>
    <td>${note}</td>
    <td>${uploadResult?.mode === "mock" ? "模擬完成" : "完成"}</td>
    <td>${commitLabel}</td>
  `;

  dom.historyBody.prepend(row);
}

function updateSelectedPdfHistory(historyRecord) {
  const buildingName = buildingNameForPayload();
  const floorLabel = floorLabelForPayload();
  const target = existingTarget(buildingName, floorLabel);
  const pdfPath = buildGithubPath();
  const date = dom.updatedAtInput.value || todayString();
  const by = dom.updatedByInput.value.trim() || "admin";
  const note = dom.updateNoteInput.value.trim() || "未填寫備註";
  const mode = selectedMode();
  const previous = state.historyByPath.get(pdfPath);
  const nextEntry = {
    date,
    action: mode === "replace" ? "replace" : "create",
    by,
    commit: "demo-pending",
    note,
  };

  const nextHistory = historyRecord
    ? {
        ...historyRecord,
        detectorCount: target.floor?.detectorCount || historyRecord.detectorCount || previous?.detectorCount || 0,
        pageCount: target.floor?.pageCount || historyRecord.pageCount || previous?.pageCount || 0,
        history: historyRecord.history || previous?.history || [],
      }
    : {
        building: buildingName,
        floor: floorLabel,
        path: pdfPath,
        latestUpdatedAt: date,
        updatedBy: by,
        note,
        detectorCount: target.floor?.detectorCount || previous?.detectorCount || 0,
        pageCount: target.floor?.pageCount || previous?.pageCount || 0,
        history: [nextEntry, ...(previous?.history || [])],
      };

  state.historyByPath.set(pdfPath, nextHistory);
  if (mode === "create" && !target.exists) {
    let building = target.building;
    if (!building) {
      building = { name: buildingName, floors: [] };
      state.buildings.push(building);
      fillBuildings(state.buildings);
      dom.buildingSelect.value = buildingName;
    }
    building.floors.push({
      label: floorLabel,
      path: pdfPath,
      detectorCount: nextHistory.detectorCount || 0,
      pageCount: nextHistory.pageCount || 0,
    });
    fillFloors();
  }
  state.pdfItems = flattenPdfItems(state.buildings);
  renderPdfList();
  updatePreview();
}

async function simulateUpload() {
  if (!state.file) {
    dom.fileSummary.textContent = "請先選擇要上傳的 PDF";
    setApiMessage("請先選擇要上傳的 PDF。", "error");
    return;
  }

  const payload = await buildUploadPayload();
  let preflightResult;

  try {
    dom.formState.textContent = "API 預檢中";
    dom.formState.classList.remove("is-ready");
    setApiMessage("正在送出預檢到管理 API。", "warning");
    preflightResult = await requestAdminApi("preflight", payload);
  } catch (error) {
    setApiMessage(error.message, "error");
    dom.formState.textContent = "API 預檢失敗";
    return;
  }

  if (!applyPreflightResult(preflightResult)) return;

  const uploadPayload = await buildUploadPayload({ includeContent: true });

  dom.formState.textContent = "API 發佈中";
  dom.formState.classList.remove("is-ready");
  setApiMessage("管理 API 已接收上傳請求，正在送出發佈流程。", "warning");

  for (let index = 0; index < pipelineSteps.length; index += 1) {
    setPipeline(index);
    await new Promise((resolve) => window.setTimeout(resolve, 650));
  }

  try {
    const uploadResult = await requestAdminApi("upload", uploadPayload);
    if (uploadResult.mode === "mock") {
      finishPipeline();
    } else {
      applyPipelineStatuses(uploadResult.pipeline || []);
    }
    dom.formState.textContent = uploadResult.mode === "mock" ? "API 模擬完成" : "已送出 GitHub";
    dom.formState.classList.add("is-ready");
    setApiMessage(`${uploadResult.message}；目標：${uploadResult.target.path}`, "ok");
    updateSelectedPdfHistory(uploadResult.historyRecord);
    addHistoryRow(uploadResult);
    dom.formState.textContent = uploadResult.mode === "mock" ? "API 模擬完成" : "已送出 GitHub";
    dom.formState.classList.add("is-ready");
  } catch (error) {
    setApiMessage(error.message, "error");
    dom.formState.textContent = "API 發佈失敗";
  }
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
  const data = await requestAdminApi("data");

  state.buildings = data.buildings || [];
  state.historyByPath = buildHistoryMap(data.history || []);
  state.pdfItems = data.pdfItems || flattenPdfItems(state.buildings);
  fillBuildings(state.buildings);
  syncModeFields();
  fillPdfBuildingFilter(state.buildings);
  renderPdfList();
  setApiMessage(`管理 API 已載入：${data.totals?.pdfs || state.pdfItems.length} 份 PDF。`, "ok");
}

dom.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  document.activeElement.blur();
  setLoginMessage("正在透過管理 API 驗證。", "warning");

  try {
    const result = await requestAdminApi("login", {
      username: dom.usernameInput.value,
      password: dom.passwordInput.value,
    });

    state.authToken = result.token || "";
    if (state.authToken) {
      window.sessionStorage.setItem("adminDemoToken", state.authToken);
    }

    await loadBuildings();
    setLoginMessage("登入成功。", "ok");
    dom.loginPanel.classList.add("is-hidden");
    dom.dashboard.classList.remove("is-hidden");
  } catch (error) {
    window.sessionStorage.removeItem("adminDemoToken");
    state.authToken = "";
    clearAdminData();
    setLoginMessage(error.message, "error");
  }
});

dom.navButtons.forEach((button) => {
  button.addEventListener("click", () => activatePanel(button.dataset.panel));
});

dom.buildingSelect.addEventListener("change", fillFloors);
dom.floorSelect.addEventListener("change", () => {
  syncUpdateFieldsFromHistory();
  updatePreview();
});
dom.modeInputs.forEach((input) => {
  input.addEventListener("change", () => {
    syncModeFields();
    syncUpdateFieldsFromHistory();
    updatePreview();
  });
});
dom.newBuildingInput.addEventListener("input", updatePreview);
dom.newFloorInput.addEventListener("input", updatePreview);
dom.uploadForm.addEventListener("change", () => {
  syncModeFields();
  updatePreview();
});
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

dom.preflightButton.addEventListener("click", async () => {
  document.activeElement.blur();
  dom.formState.textContent = "API 預檢中";
  dom.formState.classList.remove("is-ready");
  setApiMessage("正在送出預檢到管理 API。", "warning");

  try {
    applyPreflightResult(await requestAdminApi("preflight", await buildUploadPayload()));
  } catch (error) {
    setApiMessage(error.message, "error");
    dom.formState.textContent = "API 預檢失敗";
  }
});

dom.pdfListSearch.addEventListener("input", renderPdfList);
dom.pdfListBuildingFilter.addEventListener("change", renderPdfList);

dom.pdfListBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-update-pdf]");
  if (!button) return;

  const [buildingName, floorLabel] = button.dataset.updatePdf.split("|");
  dom.uploadForm.querySelector('input[name="mode"][value="replace"]').checked = true;
  dom.newBuildingInput.value = "";
  dom.newFloorInput.value = "";
  syncModeFields();
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

if (state.authToken) {
  dom.loginPanel.classList.add("is-hidden");
  dom.dashboard.classList.remove("is-hidden");
  loadBuildings().catch((error) => {
    window.sessionStorage.removeItem("adminDemoToken");
    state.authToken = "";
    dom.loginPanel.classList.remove("is-hidden");
    dom.dashboard.classList.add("is-hidden");
    setLoginMessage(error.message, "error");
  });
}

if (!state.authToken) {
  clearAdminData();
}
