const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const PDF_ROOT = path.join(ROOT, "火警圖 PDF");
const DATA_DIR = path.join(ROOT, "data");
const INDEX_PATH = path.join(DATA_DIR, "fire-map-index.json");
const BUILDINGS_PATH = path.join(DATA_DIR, "buildings.json");

const BUILDING_GROUPS = [
  { id: "common", title: "常用", buildings: ["長青樓", "思源樓", "一門診", "二門診", "三門診"] },
  { id: "clinical", title: "醫療大樓 / 中心", buildings: ["重粒子", "正子中心", "身障中心", "精神樓", "致德樓"] },
  { id: "support", title: "行政 / 支援", buildings: ["技警", "醫護宿舍"] },
  { id: "traffic", title: "停車場 / 通道", buildings: ["2號門停車場", "3號門停車場", "立體停車場", "地下連通道"] },
  { id: "other", title: "其他", buildings: [] },
];

function walkFiles(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkFiles(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) {
      result.push(fullPath);
    }
  }
  return result;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[－–—]/g, "-")
    .replace(/[：]/g, ":")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseBuildingName(filePath) {
  const relative = path.relative(PDF_ROOT, filePath);
  const folder = relative.split(path.sep)[0] || "";
  return folder
    .normalize("NFKC")
    .replace(/^\d{2,4}(?:[.．]\d{0,2}){0,3}\s*/, "")
    .replace(/火警圖\s*PDF$/i, "")
    .replace(/火警圖PDF$/i, "")
    .trim();
}

function parseFloorLabel(filePath, building) {
  const basename = path.basename(filePath, ".pdf").normalize("NFKC");
  let remainder = basename
    .replace(new RegExp(`^${escapeRegExp(building)}\\s*`), "")
    .replace(/火警圖|火警/g, " ")
    .trim();

  const range = remainder.match(/(?:RF|R\d+F?|\d+MF|\d+F|B\d+F?)\s*[~～-]\s*(?:RF|R\d+F?|\d+MF|\d+F|B\d+F?)/i);
  const single = remainder.match(/B\d+F?|R\d+F?|RF|\d+MF|\d+F/i);
  const match = range || single;
  let label = match ? match[0] : remainder || basename;

  if (match && match.index > 0) {
    const prefix = remainder.slice(0, match.index).trim();
    if (prefix) {
      label = `${prefix}${label}`;
    }
  }

  return label
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/～/g, "~")
    .toUpperCase();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function floorSortValue(label) {
  const value = normalizeText(label);
  const token = value.match(/RF|R\d+F?|\d+MF|\d+F|B\d+F?/);
  const rangeStart = token ? token[0].split(/[~-]/)[0] : value.split(/[~-]/)[0];

  if (/^RF$/.test(rangeStart)) return 2000;
  const roof = /^R(\d+)F?$/.exec(rangeStart);
  if (roof) return 2000 + Number(roof[1]);
  const mezzanine = /^(\d+)MF$/.exec(rangeStart);
  if (mezzanine) return Number(mezzanine[1]) + 0.5;
  const floor = /^(\d+)F$/.exec(rangeStart);
  if (floor) return Number(floor[1]);
  const basement = /^B(\d+)F?$/.exec(rangeStart);
  if (basement) return -Number(basement[1]);
  return -9999;
}

function groupIdForBuilding(building) {
  const group = BUILDING_GROUPS.find((candidate) => candidate.buildings.includes(building));
  return group ? group.id : "other";
}

function run(command, args, options = {}) {
  const output = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
    ...options,
  });

  if (output.error) {
    throw output.error;
  }

  if (output.status !== 0) {
    throw new Error(`${command} failed for ${args.join(" ")}\n${output.stderr}`);
  }

  return output.stdout;
}

function parsePdfWords(xml) {
  const pages = [];
  const entries = [];
  const pageRegex = /<page\b[^>]*width="([^"]+)"[^>]*height="([^"]+)"[^>]*>([\s\S]*?)<\/page>/g;
  let pageMatch;
  let pageIndex = 0;

  while ((pageMatch = pageRegex.exec(xml))) {
    pageIndex += 1;
    const pageWidth = Number(pageMatch[1]);
    const pageHeight = Number(pageMatch[2]);
    const pageXml = pageMatch[3];
    pages.push({ page: pageIndex, width: pageWidth, height: pageHeight });

    const wordRegex = /<word\b[^>]*xMin="([^"]+)"[^>]*yMin="([^"]+)"[^>]*xMax="([^"]+)"[^>]*yMax="([^"]+)"[^>]*>([\s\S]*?)<\/word>/g;
    let wordMatch;

    while ((wordMatch = wordRegex.exec(pageXml))) {
      const rawLabel = decodeEntities(wordMatch[5].replace(/<[^>]*>/g, "")).trim();
      const normalizedLabel = normalizeText(rawLabel);
      const detector = normalizedLabel.match(/(?:\d+:)?([A-Z]{1,3}\d+-\d+)/);

      if (!detector || !detector[1].startsWith("M")) {
        continue;
      }

      entries.push({
        page: pageIndex,
        label: rawLabel,
        detector: detector[1],
        normalizedLabel,
        normalizedDetector: detector[1],
        xMin: Number(wordMatch[1]),
        yMin: Number(wordMatch[2]),
        xMax: Number(wordMatch[3]),
        yMax: Number(wordMatch[4]),
        pageWidth,
        pageHeight,
      });
    }
  }

  return { pages, entries };
}

function build() {
  if (!fs.existsSync(PDF_ROOT)) {
    throw new Error(`找不到 PDF 資料夾：${PDF_ROOT}`);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  const pdfFiles = walkFiles(PDF_ROOT).sort((left, right) => left.localeCompare(right, "zh-Hant"));
  const files = [];
  const entries = [];

  for (const [fileIndex, filePath] of pdfFiles.entries()) {
    const fileId = `pdf-${String(fileIndex + 1).padStart(4, "0")}`;
    const building = parseBuildingName(filePath);
    const floor = parseFloorLabel(filePath, building);
    const relativePath = path.relative(ROOT, filePath).split(path.sep).join("/");

    process.stdout.write(`Indexing ${fileIndex + 1}/${pdfFiles.length}: ${relativePath}\n`);

    const xml = run("pdftotext", ["-bbox-layout", "-enc", "UTF-8", filePath, "-"]);
    const parsed = parsePdfWords(xml);
    const stat = fs.statSync(filePath);

    files.push({
      id: fileId,
      building,
      floor,
      path: relativePath,
      pageCount: parsed.pages.length,
      pages: parsed.pages,
      detectorCount: parsed.entries.length,
      updatedAt: stat.mtime.toISOString(),
    });

    for (const [entryIndex, entry] of parsed.entries.entries()) {
      entries.push({
        id: `${fileId}-${String(entryIndex + 1).padStart(4, "0")}`,
        fileId,
        building,
        floor,
        path: relativePath,
        ...entry,
      });
    }
  }

  const filesByBuilding = new Map();
  for (const file of files) {
    if (!filesByBuilding.has(file.building)) {
      filesByBuilding.set(file.building, []);
    }
    filesByBuilding.get(file.building).push(file);
  }

  const buildings = [...filesByBuilding.entries()]
    .map(([name, buildingFiles]) => {
      const floors = buildingFiles
        .map((file) => ({
          label: file.floor,
          fileId: file.id,
          path: file.path,
          detectorCount: file.detectorCount,
          pageCount: file.pageCount,
          sortValue: floorSortValue(file.floor),
        }))
        .sort((left, right) => right.sortValue - left.sortValue || left.label.localeCompare(right.label, "zh-Hant"));

      return {
        name,
        groupId: groupIdForBuilding(name),
        floors,
        totalDetectors: buildingFiles.reduce((sum, file) => sum + file.detectorCount, 0),
      };
    })
    .sort((left, right) => {
      const leftGroup = BUILDING_GROUPS.findIndex((group) => group.id === left.groupId);
      const rightGroup = BUILDING_GROUPS.findIndex((group) => group.id === right.groupId);
      if (leftGroup !== rightGroup) return leftGroup - rightGroup;

      const group = BUILDING_GROUPS.find((candidate) => candidate.id === left.groupId);
      const leftOrder = group ? group.buildings.indexOf(left.name) : -1;
      const rightOrder = group ? group.buildings.indexOf(right.name) : -1;
      if (leftOrder !== -1 || rightOrder !== -1) return (leftOrder === -1 ? 999 : leftOrder) - (rightOrder === -1 ? 999 : rightOrder);

      return left.name.localeCompare(right.name, "zh-Hant");
    });

  const otherGroup = BUILDING_GROUPS.find((group) => group.id === "other");
  otherGroup.buildings = buildings.filter((building) => building.groupId === "other").map((building) => building.name);

  const generatedAt = new Date().toISOString();
  const index = {
    generatedAt,
    pdfRoot: "火警圖 PDF",
    totals: {
      files: files.length,
      entries: entries.length,
      buildings: buildings.length,
    },
    files,
    entries,
  };

  const buildingData = {
    generatedAt,
    groups: BUILDING_GROUPS,
    buildings,
  };

  fs.writeFileSync(INDEX_PATH, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  fs.writeFileSync(BUILDINGS_PATH, `${JSON.stringify(buildingData, null, 2)}\n`, "utf8");

  process.stdout.write(`Done. ${files.length} PDFs, ${entries.length} detector labels, ${buildings.length} buildings.\n`);
}

build();
