const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_UPLOAD_LIMIT_MB = 25;

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
    const limit = Number(process.env.ADMIN_UPLOAD_LIMIT_MB || DEFAULT_UPLOAD_LIMIT_MB) * 1024 * 1024;

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) {
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

function normalizeText(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

function normalizeFloorLabel(value) {
  return normalizeText(value).replace(/\s+/g, "").replace(/～/g, "~").toUpperCase();
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
    mode: githubEnvReady() ? "github-ready" : "mock",
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

function isVercelRuntime() {
  return Boolean(process.env.VERCEL);
}

function getAdminConfig() {
  const username = process.env.ADMIN_USERNAME || (isVercelRuntime() ? "" : "admin");
  const password = process.env.ADMIN_PASSWORD || (isVercelRuntime() ? "" : "demo1234");
  const sessionSecret = process.env.ADMIN_SESSION_SECRET || (isVercelRuntime() ? "" : "local-dev-session-secret");

  return {
    username,
    password,
    sessionSecret,
    ready: Boolean(username && password && sessionSecret),
  };
}

function getGithubConfig() {
  return {
    token: process.env.GITHUB_TOKEN || "",
    owner: process.env.GITHUB_OWNER || "",
    repo: process.env.GITHUB_REPO || "",
    branch: process.env.GITHUB_BRANCH || "main",
  };
}

function githubEnvReady() {
  const config = getGithubConfig();
  return Boolean(config.token && config.owner && config.repo && config.branch);
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signTokenPayload(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function createSessionToken(user) {
  const config = getAdminConfig();
  const payload = base64UrlEncode(
    JSON.stringify({
      username: user.username,
      role: user.role,
      exp: Date.now() + 8 * 60 * 60 * 1000,
    })
  );
  const signature = signTokenPayload(payload, config.sessionSecret);
  return `${payload}.${signature}`;
}

function verifySessionToken(token) {
  const config = getAdminConfig();
  if (!config.ready || !token || !token.includes(".")) return null;

  const [payload, signature] = token.split(".");
  const expected = signTokenPayload(payload, config.sessionSecret);
  const actualBuffer = Buffer.from(signature || "");
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const session = JSON.parse(base64UrlDecode(payload));
    if (!session.exp || session.exp < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

function requireAdmin(req, res) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const session = verifySessionToken(token);

  if (!session) {
    sendJson(res, 401, { ok: false, error: "請先登入管理後台" });
    return null;
  }

  return session;
}

function findTarget(payload, data) {
  const buildingName = normalizeText(payload.building);
  const floorLabel = normalizeFloorLabel(payload.floor);
  const building = data.buildings.find((item) => item.name === buildingName);
  const floor = building?.floors.find((item) => item.label === floorLabel);
  const pathFromFloor = floor?.path || (buildingName && floorLabel ? buildFallbackPath(buildingName, floorLabel) : "");

  return {
    building,
    floor,
    buildingName,
    floorLabel,
    path: pathFromFloor || normalizeText(payload.path),
    exists: Boolean(floor?.path),
  };
}

function validateUploadPayload(payload, data) {
  const target = findTarget(payload, data);
  const mode = payload.mode === "create" ? "create" : "replace";
  const file = payload.file || {};
  const checks = [];
  const errors = [];
  const warnings = [];

  if (!target.buildingName) errors.push("請填寫棟別");
  if (!target.floorLabel) errors.push("請填寫樓層");
  if (/[\\/]/.test(target.buildingName)) errors.push("棟別不可包含斜線");
  if (/[\\/]/.test(target.floorLabel)) errors.push("樓層不可包含斜線");

  if (mode === "replace") {
    if (!target.building) errors.push("取代既有圖面時，必須選擇已存在的棟別");
    if (target.building && !target.floor) errors.push("取代既有圖面時，必須選擇已存在的樓層");
  }

  if (!file.name) {
    errors.push("尚未選擇 PDF 檔案");
  } else if (!file.name.toLowerCase().endsWith(".pdf")) {
    errors.push("檔名必須是 PDF");
  }

  if (!payload.updatedAt) errors.push("請填寫更新日期");
  if (!payload.updatedBy?.trim()) errors.push("請填寫更新人員");
  if (!payload.commitMessage?.trim()) errors.push("請填寫 Commit 訊息");
  if (target.path && (!target.path.startsWith("火警圖 PDF/") || target.path.includes(".."))) {
    errors.push("GitHub 路徑不允許");
  }

  if (mode === "replace" && !target.exists && target.building && target.floor) errors.push("取代既有圖面時，目標 PDF 路徑必須已存在");
  if (mode === "create" && target.exists) errors.push("此棟別樓層已存在 PDF，請改用「取代既有圖面」");

  checks.push({
    id: "file",
    label: "PDF 檔案",
    status: file.name && file.name.toLowerCase().endsWith(".pdf") ? "pass" : "fail",
    message: file.name ? `${file.name} (${formatFileSize(file.size)})` : "等待選擇",
  });
  checks.push({
    id: "target",
    label: "目標圖面",
    status:
      target.buildingName && target.floorLabel && (mode === "create" ? !target.exists : Boolean(target.building && target.floor && target.exists))
        ? "pass"
        : "fail",
    message: target.buildingName && target.floorLabel ? `${target.buildingName} ${target.floorLabel}` : "等待選擇",
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
    status: githubEnvReady() ? "pass" : "mock",
    message: githubEnvReady() ? "寫入 GitHub 後由 GitHub Actions 重建" : "本機未設定 GitHub env，目前會走 mock",
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
    mode: githubEnvReady() ? "github-ready" : "mock",
    target: {
      building: result.target.buildingName || payload.building || "",
      floor: result.target.floorLabel || payload.floor || "",
      path: result.target.path || payload.path || "",
      exists: result.target.exists,
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
    building: result.target.buildingName,
    floor: result.target.floorLabel,
    path: result.target.path,
    exists: result.target.exists,
  };

  return {
    ok: true,
    mode: "mock",
    jobId,
    message: "本機未設定 GitHub env，已完成模擬上傳，尚未寫入 GitHub",
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

function normalizeBase64Content(value) {
  return String(value || "").replace(/^data:application\/pdf;base64,/, "").replace(/\s+/g, "");
}

function validatePdfContent(payload) {
  const contentBase64 = normalizeBase64Content(payload.file?.contentBase64);

  if (!contentBase64) {
    return {
      ok: false,
      error: "沒有收到 PDF 內容",
    };
  }

  const header = Buffer.from(contentBase64.slice(0, 16), "base64").toString("utf8");
  if (!header.startsWith("%PDF-")) {
    return {
      ok: false,
      error: "檔案內容不是有效的 PDF",
    };
  }

  return {
    ok: true,
    contentBase64,
  };
}

function buildUpdatedHistoryData(payload, target, commitLabel) {
  const historyData = readJson("data/pdf-update-history.json");
  const files = historyData.files || [];
  const now = new Date().toISOString();
  const action = payload.mode === "create" ? "create" : "replace";
  const previousIndex = files.findIndex((item) => item.path === target.path);
  const previous = previousIndex >= 0 ? files[previousIndex] : null;
  const nextEntry = {
    date: payload.updatedAt,
    action,
    by: payload.updatedBy,
    commit: commitLabel,
    note: payload.note || "未填寫備註",
  };
  const nextRecord = {
    building: target.building,
    floor: target.floor,
    path: target.path,
    latestUpdatedAt: payload.updatedAt,
    updatedBy: payload.updatedBy,
    note: payload.note || "未填寫備註",
    detectorCount: previous?.detectorCount || 0,
    pageCount: previous?.pageCount || 0,
    history: [nextEntry, ...(previous?.history || [])],
  };

  const nextFiles = [...files];
  if (previousIndex >= 0) {
    nextFiles[previousIndex] = nextRecord;
  } else {
    nextFiles.push(nextRecord);
  }

  return {
    ...historyData,
    generatedAt: now,
    totals: {
      ...(historyData.totals || {}),
      files: nextFiles.length,
    },
    files: nextFiles,
  };
}

async function githubFetch(config, apiPath, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}${apiPath}`, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const acceptedPermissions = response.headers.get("x-accepted-github-permissions");
    const permissionHint = acceptedPermissions ? `；需要權限：${acceptedPermissions}` : "";
    throw new Error(`${data.message || `GitHub API error ${response.status}`}${permissionHint}`);
  }

  return data;
}

async function createGithubBlob(config, content, encoding) {
  const blob = await githubFetch(config, "/git/blobs", {
    method: "POST",
    body: JSON.stringify({
      content,
      encoding,
    }),
  });
  return blob.sha;
}

async function uploadToGithub(payload) {
  const config = getGithubConfig();
  if (!githubEnvReady()) {
    if (isVercelRuntime()) {
      return {
        ok: false,
        mode: "github",
        errors: ["GitHub 環境變數尚未設定完整"],
        missing: ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO", "GITHUB_BRANCH"].filter((key) => !process.env[key] && key !== "GITHUB_BRANCH"),
      };
    }

    return mockUpload(payload);
  }

  const data = loadAdminData();
  const result = validateUploadPayload(payload, data);
  const content = validatePdfContent(payload);

  if (!result.ok || !content.ok) {
    return {
      ok: false,
      mode: "github",
      errors: [...result.errors, ...(content.ok ? [] : [content.error])],
      warnings: result.warnings,
    };
  }

  const branch = config.branch || payload.branch || "main";
  const target = {
    building: result.target.buildingName,
    floor: result.target.floorLabel,
    path: result.target.path,
    exists: result.target.exists,
  };
  const historyData = buildUpdatedHistoryData(payload, target, "same-commit");
  const ref = await githubFetch(config, `/git/ref/heads/${encodeURIComponent(branch)}`);
  const parentSha = ref.object.sha;
  const parentCommit = await githubFetch(config, `/git/commits/${parentSha}`);
  const [pdfBlobSha, historyBlobSha] = await Promise.all([
    createGithubBlob(config, content.contentBase64, "base64"),
    createGithubBlob(config, `${JSON.stringify(historyData, null, 2)}\n`, "utf-8"),
  ]);
  const tree = await githubFetch(config, "/git/trees", {
    method: "POST",
    body: JSON.stringify({
      base_tree: parentCommit.tree.sha,
      tree: [
        {
          path: target.path,
          mode: "100644",
          type: "blob",
          sha: pdfBlobSha,
        },
        {
          path: "data/pdf-update-history.json",
          mode: "100644",
          type: "blob",
          sha: historyBlobSha,
        },
      ],
    }),
  });
  const commit = await githubFetch(config, "/git/commits", {
    method: "POST",
    body: JSON.stringify({
      message: payload.commitMessage,
      tree: tree.sha,
      parents: [parentSha],
    }),
  });

  await githubFetch(config, `/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: "PATCH",
    body: JSON.stringify({
      sha: commit.sha,
      force: false,
    }),
  });

  return {
    ok: true,
    mode: "github",
    jobId: `github-${commit.sha.slice(0, 12)}`,
    message: "已寫入 GitHub，索引將由 GitHub Actions 自動重建",
    target,
    file: {
      name: payload.file?.name,
      size: payload.file?.size,
      type: payload.file?.type,
    },
    commit: {
      branch,
      message: payload.commitMessage,
      sha: commit.sha,
      url: commit.html_url,
    },
    historyRecord: historyData.files.find((item) => item.path === target.path),
    pipeline: [
      { id: "upload", status: "done", label: "接收 PDF 上傳請求" },
      { id: "github", status: "done", label: "寫入 GitHub repository" },
      { id: "index", status: "pending", label: "等待 GitHub Actions 重建索引" },
      { id: "commit", status: "done", label: "commit PDF 與更新紀錄" },
      { id: "deploy", status: "pending", label: "等待 Vercel 部署完成" },
    ],
  };
}

function mockLogin(payload) {
  const config = getAdminConfig();
  const username = String(payload.username || "").trim();
  const password = String(payload.password || "");

  if (!config.ready) {
    return {
      ok: false,
      mode: "mock",
      error: "管理登入環境變數尚未設定完整",
    };
  }

  if (username !== config.username || password !== config.password) {
    return {
      ok: false,
      mode: githubEnvReady() ? "github-ready" : "mock",
      error: "帳號或密碼不正確",
    };
  }

  const user = {
    username,
    role: "admin",
  };

  return {
    ok: true,
    mode: githubEnvReady() ? "github-ready" : "mock",
    user,
    token: createSessionToken(user),
    permissions: ["pdf:read", "pdf:upload", githubEnvReady() ? "github:commit" : "github:commit:mock"],
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

      if (!requireAdmin(req, res)) return;
      sendJson(res, 200, loadAdminData());
      return;
    }

    if (action === "preflight") {
      if (req.method !== "POST") {
        sendJson(res, 405, { ok: false, error: "Method not allowed" });
        return;
      }

      if (!requireAdmin(req, res)) return;
      sendJson(res, 200, preflightUpload(await collectJson(req)));
      return;
    }

    if (action === "upload") {
      if (req.method !== "POST") {
        sendJson(res, 405, { ok: false, error: "Method not allowed" });
        return;
      }

      if (!requireAdmin(req, res)) return;
      const result = await uploadToGithub(await collectJson(req));
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
  uploadToGithub,
};
