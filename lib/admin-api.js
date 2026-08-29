const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function readJson(relativePath) {
  const filePath = path.join(ROOT, relativePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload, null, 2));
}

function collectJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("REQUEST_TOO_LARGE"));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function buildHistoryMap(historyData) {
  return new Map((historyData.files || []).map((item) => [item.path, item]));
}

function buildFallbackPath(buildingName, floorLabel) {
  return `火警圖 PDF/${buildingName}/${buildingName}${floorLabel} 火警圖.pdf`;
}

function flattenPdfItems(buildings, historyMap) {
  return buildings.flatMap((building) =>
    building.floors.map((floor) => {
      const itemPath = floor.path || buildFallbackPath(building.name, floor.label);
      const history = historyMap.get(itemPath);

      return {
        building: building.name,
        floor: floor.label,
        path: itemPath,
        fileId: floor.fileId || "",
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

function loadAdminData() {
  const buildingData = readJson("data/buildings.json");
  const historyData = readJson("data/pdf-update-history.json");
  const historyMap = buildHistoryMap(historyData);
  const buildings = buildingData.buildings || [];
  const pdfItems = flattenPdfItems(buildings, historyMap);

  return {
    ok: true,
    mode: "mock",
    generatedAt: new Date().toISOString(),
    source: {
      buildings: "data/buildings.json",
      history: "data/pdf-update-history.json",
    },
    totals: {
      buildings: buildings.length,
      pdfs: pdfItems.length,
      historyRecords: historyData.files?.length || 0,
    },
    groups: buildingData.groups || [],
    buildings,
    pdfItems,
    history: historyData.files || [],
  };
}

function findTarget(payload, data) {
  const building = data.buildings.find((item) => item.name === payload.building);
  const floor = building?.floors.find((item) => item.label === payload.floor);
  const pathFromFloor = floor?.path || (building && floor ? buildFallbackPath(building.name, floor.label) : "");

  return {
    building,
    floor,
    path: payload.path || pathFromFloor,
  };
}

function validateUploadPayload(payload, data) {
  const target = findTarget(payload, data);
  const mode = payload.mode === "create" ? "create" : "replace";
  const file = payload.file || {};
  const checks = [];
  const errors = [];
  const warnings = [];

  if (!target.building) errors.push("找不到指定棟別");
  if (target.building && !target.floor) errors.push("找不到指定樓層");

  if (!file.name) {
    errors.push("尚未選擇 PDF 檔案");
  } else if (!file.name.toLowerCase().endsWith(".pdf")) {
    errors.push("檔名必須是 PDF");
  }

  if (!payload.updatedAt) errors.push("請填寫更新日期");
  if (!payload.updatedBy?.trim()) errors.push("請填寫更新人員");
  if (!payload.commitMessage?.trim()) errors.push("請填寫 Commit 訊息");

  const exists = Boolean(target.floor?.path);
  if (mode === "replace" && !exists) warnings.push("目前清單內沒有既有路徑，正式上傳時會改以新增處理");
  if (mode === "create" && exists) warnings.push("此棟別樓層已存在 PDF，正式上傳時會覆蓋同一路徑");

  checks.push({
    id: "file",
    label: "PDF 檔案",
    status: file.name && file.name.toLowerCase().endsWith(".pdf") ? "pass" : "fail",
    message: file.name ? `${file.name} (${formatFileSize(file.size)})` : "等待選擇",
  });
  checks.push({
    id: "target",
    label: "目標圖面",
    status: target.building && target.floor ? "pass" : "fail",
    message: target.building && target.floor ? `${target.building.name} ${target.floor.label}` : "等待選擇",
  });
  checks.push({
    id: "path",
    label: "GitHub 路徑",
    status: target.path ? "pass" : "fail",
    message: target.path || "尚未建立路徑",
  });
  checks.push({
    id: "index",
    label: "索引策略",
    status: "mock",
    message: "3A 先模擬；3B 會 commit 後交給 GitHub Actions 重建",
  });

  return {
    ok: errors.length === 0,
    mode,
    target,
    checks,
    errors,
    warnings,
  };
}

function formatFileSize(size) {
  if (!Number.isFinite(size) || size <= 0) return "-";
  const mb = size / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  return `${Math.ceil(size / 1024)} KB`;
}

function preflightUpload(payload) {
  const data = loadAdminData();
  const result = validateUploadPayload(payload, data);

  return {
    ok: result.ok,
    mode: "mock",
    target: {
      building: result.target.building?.name || payload.building || "",
      floor: result.target.floor?.label || payload.floor || "",
      path: result.target.path || payload.path || "",
    },
    checks: result.checks,
    errors: result.errors,
    warnings: result.warnings,
  };
}

function mockUpload(payload) {
  const data = loadAdminData();
  const result = validateUploadPayload(payload, data);

  if (!result.ok) {
    return {
      ok: false,
      mode: "mock",
      errors: result.errors,
      warnings: result.warnings,
    };
  }

  const now = new Date();
  const jobId = `mock-${now.getTime()}`;
  const action = result.mode === "replace" ? "replace" : "create";
  const target = {
    building: result.target.building.name,
    floor: result.target.floor.label,
    path: result.target.path,
  };

  return {
    ok: true,
    mode: "mock",
    jobId,
    message: "3A 模擬上傳完成，尚未寫入 GitHub",
    target,
    file: payload.file,
    commit: {
      branch: payload.branch || "main",
      message: payload.commitMessage,
      sha: "mock-pending",
    },
    historyRecord: {
      building: target.building,
      floor: target.floor,
      path: target.path,
      latestUpdatedAt: payload.updatedAt,
      updatedBy: payload.updatedBy,
      note: payload.note || "未填寫備註",
      history: [
        {
          date: payload.updatedAt,
          action,
          by: payload.updatedBy,
          commit: "mock-pending",
          note: payload.note || "未填寫備註",
        },
      ],
    },
    pipeline: [
      { id: "upload", status: "done", label: "接收 PDF 上傳請求" },
      { id: "github", status: "mock", label: "模擬寫入 GitHub repository" },
      { id: "index", status: "mock", label: "模擬觸發索引重建" },
      { id: "commit", status: "mock", label: "模擬產生 commit" },
      { id: "deploy", status: "mock", label: "模擬等待 Vercel 部署" },
    ],
  };
}

function mockLogin(payload) {
  const username = String(payload.username || "").trim();
  const password = String(payload.password || "");

  if (username !== "admin" || password !== "demo1234") {
    return {
      ok: false,
      mode: "mock",
      error: "帳號或密碼不正確",
    };
  }

  return {
    ok: true,
    mode: "mock",
    user: {
      username,
      role: "admin",
    },
    permissions: ["pdf:read", "pdf:upload", "github:commit:mock"],
  };
}

async function handleNodeRequest(req, res, action) {
  try {
    if (action === "login") {
      if (req.method !== "POST") {
        sendJson(res, 405, { ok: false, error: "Method not allowed" });
        return;
      }

      const result = mockLogin(await collectJson(req));
      sendJson(res, result.ok ? 200 : 401, result);
      return;
    }

    if (action === "data") {
      if (req.method !== "GET") {
        sendJson(res, 405, { ok: false, error: "Method not allowed" });
        return;
      }

      sendJson(res, 200, loadAdminData());
      return;
    }

    if (action === "preflight") {
      if (req.method !== "POST") {
        sendJson(res, 405, { ok: false, error: "Method not allowed" });
        return;
      }

      sendJson(res, 200, preflightUpload(await collectJson(req)));
      return;
    }

    if (action === "upload") {
      if (req.method !== "POST") {
        sendJson(res, 405, { ok: false, error: "Method not allowed" });
        return;
      }

      const result = mockUpload(await collectJson(req));
      sendJson(res, result.ok ? 200 : 400, result);
      return;
    }

    sendJson(res, 404, { ok: false, error: "API not found" });
  } catch (error) {
    const statusCode = error.message === "REQUEST_TOO_LARGE" ? 413 : 500;
    sendJson(res, statusCode, {
      ok: false,
      error: statusCode === 413 ? "Request too large" : "Admin API error",
      detail: error.message,
    });
  }
}

module.exports = {
  handleNodeRequest,
  loadAdminData,
  mockLogin,
  mockUpload,
  preflightUpload,
};
