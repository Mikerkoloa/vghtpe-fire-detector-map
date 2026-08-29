const dom = {
  loginPanel: document.querySelector("#loginPanel"),
  loginForm: document.querySelector("#loginForm"),
  dashboard: document.querySelector("#dashboard"),
  navButtons: [...document.querySelectorAll("[data-panel]")],
  panels: [...document.querySelectorAll(".work-area")],
  buildingSelect: document.querySelector("#buildingSelect"),
  floorSelect: document.querySelector("#floorSelect"),
  branchInput: document.querySelector("#branchInput"),
  commitInput: document.querySelector("#commitInput"),
  fileInput: document.querySelector("#fileInput"),
  fileSummary: document.querySelector("#fileSummary"),
  dropZone: document.querySelector("#dropZone"),
  githubPath: document.querySelector("#githubPath"),
  formState: document.querySelector("#formState"),
  checkFile: document.querySelector("#checkFile"),
  checkTarget: document.querySelector("#checkTarget"),
  preflightButton: document.querySelector("#preflightButton"),
  uploadForm: document.querySelector("#uploadForm"),
  pipeline: document.querySelector("#pipeline"),
  historyBody: document.querySelector("#historyBody"),
};

const state = {
  buildings: [],
  file: null,
};

const pipelineSteps = ["upload", "github", "index", "commit", "deploy"];

function normalizeFileSize(size) {
  if (!size) return "-";
  const mb = size / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  return `${Math.ceil(size / 1024)} KB`;
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

function updatePreview() {
  const building = selectedBuilding();
  const floor = selectedFloor();
  const mode = new FormData(dom.uploadForm).get("mode");
  const targetText = building && floor ? `${building.name} ${floor.label}` : "等待選擇";

  dom.githubPath.textContent = buildGithubPath();
  dom.checkTarget.textContent = targetText;

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
  const row = document.createElement("tr");

  row.innerHTML = `
    <td>${now.toLocaleString("zh-TW", { hour12: false })}</td>
    <td>${building ? building.name : "-"} ${floor ? floor.label : ""}</td>
    <td>${mode}</td>
    <td>完成</td>
    <td>等待 Vercel</td>
  `;

  dom.historyBody.prepend(row);
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
  addHistoryRow();
}

function activatePanel(panelId) {
  dom.navButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.panel === panelId);
  });

  dom.panels.forEach((panel) => {
    panel.classList.toggle("is-hidden", panel.id !== panelId);
  });
}

async function loadBuildings() {
  const response = await fetch("./data/buildings.json");
  if (!response.ok) throw new Error("buildings.json 載入失敗");
  const data = await response.json();
  state.buildings = data.buildings || [];
  fillBuildings(state.buildings);
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
dom.floorSelect.addEventListener("change", updatePreview);
dom.uploadForm.addEventListener("change", updatePreview);

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
  fillBuildings(state.buildings);
});
