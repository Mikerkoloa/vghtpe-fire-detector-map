const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = packageJson.version;
const expectedBadge = `data-app-version="${version}"`;
const expectedLabel = `v${version}`;

const checks = [
  {
    file: "index.html",
    validate: (content) => content.includes(expectedBadge) && content.includes(`>${expectedLabel}<`),
  },
  {
    file: "admin.html",
    validate: (content) => content.includes(expectedBadge) && content.includes(`>${expectedLabel}<`),
  },
  {
    file: "CHANGELOG.md",
    validate: (content) => content.includes(`## ${expectedLabel} - `),
  },
];

const failures = checks.filter(({ file, validate }) => {
  const content = fs.readFileSync(path.join(root, file), "utf8");
  return !validate(content);
});

if (failures.length > 0) {
  console.error(`Version ${expectedLabel} is not synchronized in:`);
  for (const failure of failures) console.error(`- ${failure.file}`);
  process.exit(1);
}

console.log(`Version ${expectedLabel} is synchronized.`);
