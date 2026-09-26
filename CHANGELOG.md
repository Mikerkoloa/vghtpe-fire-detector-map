# Changelog

## v0.2.7 - 2026-09-26

- Added local browser recent queries to the query assistant, with one-tap replay and clear controls.
- Added admin-managed app settings in `data/app-settings.json`, including the assistant recent-query limit.
- Expanded local assistant parsing for common request phrases, building aliases, and roof wording such as `頂樓` / `屋頂`.

## v0.2.6 - 2026-09-26

- Extended the local query assistant so a full detector code such as `M6-55` lists matching locations across the whole site.
- Supports building-scoped full detector queries such as `身障 M6-55`, which searches all floors in that building and lets the user choose the result.
- Added visible usage hints inside the assistant for full-site, building-scoped, and floor-required number searches.

## v0.2.5 - 2026-09-26

- Added the first local-only "查詢助手" on the main page, opened from the header next to the manual link.
- Supports natural query groups such as `長青B3 55 73 65、思源6樓 55 99`, then opens the selected PDF and circles matching detector labels.
- Added local parsing for common building aliases and floor phrasing such as `長青`, `思源`, `6樓`, `B3`, and `地下3樓`.

## v0.2.4 - 2026-09-26

- Added an admin-only "修正更新紀錄" workflow for correcting a PDF update date, editor, and note without re-uploading the PDF.
- Added a GitHub-backed `/api/admin/history` endpoint that updates `data/pdf-update-history.json`.
- Updated the PDF replacement flow to commit `data/buildings.json` together with the uploaded PDF and history record so renamed PDF paths stay aligned before the index rebuild completes.

## v0.2.3 - 2026-09-25

- Replaced `思源樓6F 火警圖.pdf` with `思源樓6F 20260910.pdf`.
- Rebuilt the PDF index and history so 思源樓 6F uses the new file path and shows `2026年09月25日更新`.
- Added the future PDF naming rule: `棟別樓層 YYYYMMDD.pdf`.
- Updated the admin upload flow so replacing a floor can use the uploaded PDF filename as the new path and remove the old PDF path in the same GitHub commit.
- Added main-page update-date display for non-initial PDF update records.

## v0.2.2 - 2026-09-03

- Added a Vercel permanent redirect from `/index.html` to `/`.
- Updated the web app manifest start URL to open `/` instead of `/index.html`.
- Updated local navigation links and the development server to use the same clean homepage URL.

## v0.2.1 - 2026-09-03

- Moved the main query page version badge beside the brand title on desktop so the manual button stays in the header row.
- Kept the mobile header layout readable without horizontal overflow.

## v0.2.0 - 2026-09-03

- Added visible app version badges to the main query page and PDF admin page.
- Added version consistency checking with `npm run check:version`.
- Improved detector-code tag input: editable tags, Backspace-to-edit, `M160` normalization, and slower auto-tagging for partial `M3-15` style input.
- Added multi-storey parking map support and refreshed PDF index/history data.
