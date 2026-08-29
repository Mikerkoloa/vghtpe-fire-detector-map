const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PDF_ROOT = path.join(ROOT, "火警圖 PDF");
const BUILDINGS_PATH = path.join(ROOT, "data", "buildings.json");

const shouldApply = process.argv.includes("--apply");

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function targetPathFor(buildingName, currentPath) {
  const filename = path.basename(currentPath);
  return toPosixPath(path.join("火警圖 PDF", buildingName, filename));
}

function uniquePlans(buildingData) {
  const plans = [];
  const seenSources = new Set();

  for (const building of buildingData.buildings || []) {
    for (const floor of building.floors || []) {
      if (!floor.path || seenSources.has(floor.path)) continue;
      seenSources.add(floor.path);

      const targetPath = targetPathFor(building.name, floor.path);
      plans.push({
        building: building.name,
        floor: floor.label,
        sourcePath: floor.path,
        targetPath,
        unchanged: floor.path === targetPath,
      });
    }
  }

  return plans;
}

function validatePlans(plans) {
  const errors = [];
  const targetToSources = new Map();

  for (const plan of plans) {
    const sourceFullPath = path.join(ROOT, plan.sourcePath);
    const targetFullPath = path.join(ROOT, plan.targetPath);

    if (!fs.existsSync(sourceFullPath)) {
      errors.push(`找不到來源 PDF：${plan.sourcePath}`);
    }

    const targetSources = targetToSources.get(plan.targetPath) || [];
    targetSources.push(plan.sourcePath);
    targetToSources.set(plan.targetPath, targetSources);

    if (!plan.unchanged && fs.existsSync(targetFullPath)) {
      errors.push(`目標已存在，需人工確認：${plan.targetPath}`);
    }
  }

  for (const [targetPath, sources] of targetToSources.entries()) {
    if (sources.length > 1) {
      errors.push(`多個 PDF 會寫到同一目標：${targetPath} <= ${sources.join(", ")}`);
    }
  }

  return errors;
}

function removeEmptyDirectory(dir) {
  if (dir === PDF_ROOT || !dir.startsWith(PDF_ROOT)) return;

  try {
    fs.rmdirSync(dir);
    removeEmptyDirectory(path.dirname(dir));
  } catch {
    // Directory is not empty or cannot be removed; leave it in place.
  }
}

function applyPlans(plans) {
  for (const plan of plans) {
    if (plan.unchanged) continue;

    const sourceFullPath = path.join(ROOT, plan.sourcePath);
    const targetFullPath = path.join(ROOT, plan.targetPath);
    fs.mkdirSync(path.dirname(targetFullPath), { recursive: true });
    fs.renameSync(sourceFullPath, targetFullPath);
    removeEmptyDirectory(path.dirname(sourceFullPath));
  }
}

function printPlans(plans) {
  for (const plan of plans) {
    const prefix = plan.unchanged ? "SKIP" : shouldApply ? "MOVE" : "DRY";
    process.stdout.write(`${prefix} ${plan.sourcePath} -> ${plan.targetPath}\n`);
  }
}

function build() {
  if (!fs.existsSync(BUILDINGS_PATH)) {
    throw new Error(`找不到 ${BUILDINGS_PATH}`);
  }

  if (!fs.existsSync(PDF_ROOT)) {
    throw new Error(`找不到 ${PDF_ROOT}`);
  }

  const buildingData = JSON.parse(fs.readFileSync(BUILDINGS_PATH, "utf8"));
  const plans = uniquePlans(buildingData);
  const errors = validatePlans(plans);
  const movePlans = plans.filter((plan) => !plan.unchanged);

  printPlans(plans);

  process.stdout.write("\n");
  process.stdout.write(`PDF total: ${plans.length}\n`);
  process.stdout.write(`Will move: ${movePlans.length}\n`);
  process.stdout.write(`Already clean: ${plans.length - movePlans.length}\n`);
  process.stdout.write(`Mode: ${shouldApply ? "apply" : "dry-run"}\n`);

  if (errors.length > 0) {
    process.stderr.write("\n");
    process.stderr.write(errors.map((error) => `ERROR ${error}`).join("\n"));
    process.stderr.write("\n");
    process.exitCode = 1;
    return;
  }

  if (shouldApply) {
    applyPlans(movePlans);
    process.stdout.write("Applied PDF path migration.\n");
  } else {
    process.stdout.write("Dry-run only. Add --apply to move files.\n");
  }
}

build();
