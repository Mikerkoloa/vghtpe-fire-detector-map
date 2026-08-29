const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const BUILDINGS_PATH = path.join(ROOT, "data", "buildings.json");
const HISTORY_PATH = path.join(ROOT, "data", "pdf-update-history.json");

function normalizeDatePart(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[．。]/g, ".")
    .replace(/\.{2,}/g, ".");
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function parseDateFromPath(filePath) {
  const normalized = normalizeDatePart(filePath);
  const match = normalized.match(/(?:^|\/)(\d{2,4})\.(\d{1,2})\.(\d{1,2})(?=\s|\/|[^0-9])/);

  if (!match) {
    return {
      date: null,
      sourceDateLabel: null,
    };
  }

  const rawYear = Number(match[1]);
  const year = rawYear < 1911 ? rawYear + 1911 : rawYear;
  const month = Number(match[2]);
  const day = Number(match[3]);

  return {
    date: `${year}-${pad(month)}-${pad(day)}`,
    sourceDateLabel: `${match[1]}.${pad(month)}.${pad(day)}`,
  };
}

function historyKey(item) {
  return `${item.building}::${item.floor}::${item.path}`;
}

function loadExistingHistory() {
  if (!fs.existsSync(HISTORY_PATH)) return new Map();

  const data = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
  return new Map((data.files || []).map((item) => [historyKey(item), item]));
}

function build() {
  const buildingData = JSON.parse(fs.readFileSync(BUILDINGS_PATH, "utf8"));
  const existing = loadExistingHistory();
  const generatedAt = new Date().toISOString();

  const files = [];

  for (const building of buildingData.buildings || []) {
    for (const floor of building.floors || []) {
      const item = {
        building: building.name,
        floor: floor.label,
        path: floor.path,
      };
      const key = historyKey(item);
      const previous = existing.get(key);

      if (previous) {
        files.push({
          ...previous,
          detectorCount: floor.detectorCount || 0,
          pageCount: floor.pageCount || 0,
        });
        continue;
      }

      const parsedDate = parseDateFromPath(floor.path);
      const importedAt = parsedDate.date || generatedAt.slice(0, 10);
      const note = parsedDate.sourceDateLabel
        ? `從既有資料夾日期 ${parsedDate.sourceDateLabel} 初始匯入`
        : "從既有 PDF 清單初始匯入";

      files.push({
        building: building.name,
        floor: floor.label,
        path: floor.path,
        latestUpdatedAt: importedAt,
        updatedBy: "system",
        note,
        detectorCount: floor.detectorCount || 0,
        pageCount: floor.pageCount || 0,
        history: [
          {
            date: importedAt,
            action: "initial-import",
            by: "system",
            commit: null,
            note,
          },
        ],
      });
    }
  }

  const output = {
    generatedAt,
    source: "data/buildings.json",
    totals: {
      files: files.length,
    },
    files,
  };

  fs.writeFileSync(HISTORY_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  process.stdout.write(`Done. ${files.length} PDF history records.\n`);
}

build();
