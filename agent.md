# Codex 交接紀錄

本文件是給另一台電腦上的 Codex 接續開發用。請先閱讀本文件，再閱讀 `README.md` 與原始碼。

## 專案目標

使用者要建立一個網頁前端，用來搜尋火警探測器定址碼，例如 `長青樓6F M1-66`，並在 PDF 圖面中顯示該樓層圖面與圈選位置。

主要資料來源是專案根目錄的 `火警圖 PDF` 資料夾。

## 已確認的資料狀態

- PDF 總數：133 份。
- 產生索引後的探測器文字標籤：11,715 筆。
- 已刪除 `長青樓 R2F~B3 火警.pdf`，並重新產生索引；搜尋結果不應再出現該合併圖。
- PDF 總大小約 34.85 MB。
- 最大單一 PDF 約 1.49 MB。
- PDF 結構大致為「日期 + 棟別火警圖PDF」資料夾，底下是各樓層 PDF。

目前主要棟別包含：

- 長青樓
- 思源樓
- 一門診
- 二門診
- 三門診
- 致德樓
- 身障中心
- 2號門停車場
- 3號門停車場
- 地下連通道
- 技警
- 正子中心
- 精神樓
- 醫護宿舍
- 重粒子

## 討論後定案的設計方向

使用者不想要下拉選單。介面定案為「北榮風格的單頁查詢工作台」。

版面：

- 上方：系統名稱與全域搜尋列。
- 左側：棟別按鈕，依分類顯示。
- 中上：樓層按鈕，像電梯盤。
- 中央：PDF 圖面。
- 右側：搜尋結果。

視覺參考臺北榮民總醫院官網，但不是做入口網站，而是做值班室或現場人員快速查圖的工作介面。

## 搜尋規則

全域搜尋：

- `M1-66`：只列出符合的棟別與樓層，不自動開 PDF，不畫圈。
- `長青樓 M1-66`：只列出長青樓內符合結果。
- `長青樓 6F M2-66`：直接開啟指定 PDF 並圈選。
- `長青樓 6F`：只開啟該樓層 PDF，不圈選。

目前 PDF 搜尋：

- 使用者手動選棟別與樓層後，第一次顯示該 PDF 時會在圖面中央跳出「搜尋定址碼」。
- 中央搜尋只搜尋目前這張 PDF。
- 搜尋後若找到，圈選第一筆並捲動到位置。
- 中央搜尋框關閉後，工具列仍有「搜尋定址碼」小搜尋框。

## 圈選規則

第一版只圈選「探測器編號文字標籤」，例如 `36:M2-66` 或 `M1-75`，不是圈選探測器圖符本體。

標記樣式：

- 粗紅橘色外圈。
- 淡黃色底光。
- 旁邊顯示標籤文字。
- 搜尋命中會自動捲到標記附近。
- 雙擊標記可放大圖面。

## 已修正的重要問題

### PDF 旋轉造成座標偏移

一開始用 `pdftotext` 的 page width/height 直接縮放座標，某些 PDF 例如 `一門診3F` 有頁面旋轉，導致圈選位置錯誤。

最後修正方向：

- 不用 PDF 原始未旋轉尺寸推算標記。
- 使用 PDF.js 實際渲染後的 viewport 尺寸。
- 將 `pdftotext` 抽出的文字座標按 PDF.js 顯示尺寸縮放。

已驗證 `一門診 3F / M1-75` 不再偏到右側。

### 快速互動造成 canvas render 衝突

PDF.js 有時會出現同一 canvas 被多次 render 的錯誤。

最後處理方式：

- 每次渲染頁面時建立新的 canvas。
- 用 `replaceWith` 替換舊 canvas。
- 避免多次縮放或快速操作時共用同一張 canvas。

### 索引尚未載入就搜尋

若使用者剛開頁面、索引 JSON 還沒完成載入就按搜尋，原本會報錯。

已加防護：

- 若 `state.index` 或 `state.buildingData` 尚未存在，顯示「索引載入中」提示。

## 目前互動功能

PDF viewer 支援：

- 工具列放大、縮小、適合寬度。
- 滑鼠滾輪縮放，以游標所在位置為中心。
- 左鍵拖曳平移圖面。
- 雙擊圈選標記放大。
- 清除標記。
- 開啟原始 PDF。

## 主要檔案

- `index.html`：頁面結構。
- `assets/styles.css`：版面與互動樣式。
- `assets/app.js`：搜尋、PDF.js 渲染、標記、縮放、拖曳、目前圖面搜尋。
- `scripts/build-index.js`：呼叫 Poppler `pdftotext` 建立索引。
- `server.js`：本機靜態伺服器，支援 PDF range request。
- `data/fire-map-index.json`：探測器標籤索引。
- `data/buildings.json`：棟別與樓層資料。

## 本機啟動

```powershell
cd C:\code\北榮火警探測器搜尋網頁
node server.js
```

開啟：

```text
http://localhost:4173
```

## 更新 PDF 後

```powershell
node scripts/build-index.js
```

## 已做過的驗證

- `M1-66`：只顯示結果，不開 PDF。
- `長青樓6FM2-66`：可直接開 PDF 並圈選 `36:M2-66`。
- `M1-75` 搜尋後點 `一門診 3F`：可圈選正確位置。
- 手動選 `一門診 2F`：第一次會跳出中央「搜尋定址碼」。
- 在中央搜尋 `M1-82`：可圈選。
- 在工具列搜尋 `M1-245`：可圈選。
- 搜尋 `M9-999`：顯示目前圖面找不到，清除標記。
- 滾輪縮放與雙擊標記放大已測過。

## GitHub 上傳狀態

使用者要求建立公開 GitHub repository 並上傳。

GitHub repository 已建立並推送：

```text
https://github.com/Mikerkoloa/vghtpe-fire-detector-map
```

## Vercel 部署狀態

已部署到 Vercel production：

```text
https://vghtpe-fire-detector-map.vercel.app
```

檢查結果：

- 首頁 `/` 回應 200。
- `data/buildings.json` 回應 200。
- `data/fire-map-index.json` 回應 200。
- PDF 靜態檔案可讀取，例如 `一門診2F 火警圖.pdf` 回應 200。

目前這台環境曾經遇到：

- `git` 可用。
- `gh` CLI 不可用。
- 沒有偵測到 `GITHUB_TOKEN` 或 `GH_TOKEN` 類環境變數。
- 但本機 git credential 可用，因此已透過 GitHub API 建立 repository。
- Vercel CLI 透過 `npx.cmd vercel` 執行，已登入 `mikerkoloa`，Vercel scope 是 `weimi-s-projects`。
- Vercel project 為 `vghtpe-fire-detector-map`。

若要由 Codex 繼續建立 GitHub repository，有幾種方式：

1. 安裝或啟用 GitHub plugin。
2. 安裝 GitHub CLI 並登入。
3. 使用者先在 GitHub 建立公開 repo，再把 remote URL 給 Codex。

建議 repo 名稱：

```text
vghtpe-fire-detector-map
```

## 公開 repository 注意事項

`火警圖 PDF` 內含院區火警圖面與探測器位置。如果推到公開 GitHub，這些 PDF 會被公開。

使用者已明確要求使用公開 repository，但後續接手者仍應在推送前再次確認公開範圍是否符合使用者期待。

## 後續建議

- 可以加入「目前圖面搜尋結果上一筆/下一筆」。
- 可以加入搜尋歷史。
- 可以新增「只顯示目前棟別結果」的切換。
- 若未來要圈探測器圖符本體，需要人工校正或更進階的圖形辨識，不是第一版範圍。

## 2026-05-12 手機版修正

- 使用 iPhone 14 Pro Max 尺寸 430 x 932 做自動化檢查。
- 修正手機版被 `100vh` 與內層捲動容器鎖住，導致頁面無法正常往下捲的問題。
- 手機版棟別改為兩欄按鈕網格，避免原本橫向群組不好選。
- PDF 工具列在手機版改為自然高度與換行按鈕，避免搜尋列/工具按鈕被撐高或切到右側。
- 驗證結果：430px viewport 下 `docScrollWidth = 430`，無水平溢出；可選一門診 2F、載入 PDF、搜尋 `M1-82` 並產生 1 個圈選標記。
