# Codex 交接紀錄

本文件是給另一台電腦上的 Codex 接續開發用。請先閱讀本文件，再閱讀 `README.md` 與原始碼。

## 專案目標

使用者要建立一個網頁前端，用來搜尋火警探測器定址碼，例如 `長青樓6F M1-66`，並在 PDF 圖面中顯示該樓層圖面與圈選位置。

主要資料來源是專案根目錄的 `火警圖 PDF` 資料夾。

## 已確認的資料狀態

- PDF 總數：133 份。
- 產生索引後的探測器文字標籤：11,727 筆。
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

## 2026-05-12 二門診 7F PDF 更新

- 使用者更新 `火警圖 PDF/115.04.26 二門診火警圖PDF/二門診7F 火警圖.pdf`。
- 已重新執行 `node scripts/build-index.js`。
- 索引統計更新為 133 份 PDF、11,721 筆探測器文字標籤。

## 2026-05-18 思源樓 1F PDF 更新

- 使用者更新 `火警圖 PDF/115..04.25 思源樓火警圖PDF/思源樓1F 火警圖.pdf`。
- 已重新執行 `node scripts/build-index.js`。
- 思源樓 1F 新索引抓到 199 筆探測器文字標籤。
- 全站索引統計更新為 133 份 PDF、11,727 筆探測器文字標籤。

## 2026-05-14 Windows 10 背景執行腳本

- 新增 `scripts/windows/` 內的背景執行與工作排程腳本。
- 預設方式是 Windows 工作排程器「使用者登入時」啟動，不需要額外安裝服務工具。
- 常用指令：
  - `npm run win:start`
  - `npm run win:status`
  - `npm run win:stop`
  - `npm run win:register`
  - `npm run win:unregister`
- 注意：`win:register` 需要使用者自己執行，Codex 沒有直接替使用者註冊開機自動啟動。

## 2026-05-14 HTML 使用手冊

- 新增 `manual.html` 與 `assets/manual.css`。
- 主查詢頁右上角新增「使用手冊」入口。
- 手冊內容分成一般使用者與維護者：搜尋方式、選棟別樓層、PDF 操作、更新 PDF、Windows 背景啟動。
- 已用桌面與 430px 手機尺寸檢查；手機版 `scrollWidth = 430`、`clientWidth = 430`，沒有水平溢出。

## 2026-08-29 iPhone Safari 搜尋版面修正

- 使用者回報 iPhone Safari 搜尋結果仍在右側，Chrome 則正常顯示在下方。
- 判斷 Safari 可能未命中單純 `max-width: 960px` 的手機版媒體條件，或網域被設定為要求桌面版網站。
- 手機版主要 layout 改為 `max-width: 960px`、`max-device-width: 960px` 或觸控裝置 `(hover: none) and (pointer: coarse)` 都套用。
- 搜尋標籤輸入框的 `input` 全域固定 `font-size: 16px`，避免 iOS Safari/Chrome 聚焦時自動放大頁面。
- 後續使用者回報 Safari 搜尋在下方後，按搜尋仍會放大且停在放大尺寸。
- 補上 viewport `maximum-scale=1`、`text-size-adjust: 100%`、手機搜尋表單按鈕 16px，並在三個搜尋表單送出後主動 blur 目前焦點控制項。
- `index.html` 的 CSS/JS query string 已更新，避免手機 Safari 快取舊檔。

## 2026-08-29 PDF 管理後台前端 Demo

- 新增純前端 `admin-demo.html`，用來討論 PDF 管理後台設計，不接真實 GitHub API。
- Demo 包含管理員登入、上傳/取代 PDF、棟別樓層選擇、GitHub 路徑預覽、預檢結果、發佈流程、發佈紀錄、權限設定。
- `assets/admin-demo.js` 會讀取現有 `data/buildings.json` 產生棟別與樓層選單，並模擬上傳到 GitHub、重建索引、commit、等待 Vercel 部署。
- `assets/admin-demo.css` 以工作台版面為主，桌面三欄、手機單欄，輸入與按鈕維持 16px 避免 iPhone Safari 放大。

## 2026-08-28 多定址碼標籤搜尋

- 全域搜尋與目前 PDF 搜尋都改為支援定址碼標籤。
- 輸入 `M1-66` 或簡寫 `M166` 會正規化為 `M1-66` 標籤。
- 可一次貼上或輸入多個完整定址碼，例如 `M1-66 M2-60`，重複定址碼會自動去重。
- 已取消 `M1-50 60 55` 這種純數字沿用前一個 M 群組的設計；每個標籤都必須能解析成完整定址碼。
- 全域搜尋仍維持原規則：只有定址碼時列結果；棟別加樓層加定址碼時才直接開圖。若有多個定址碼且都在指定樓層命中，會一次圈選多個標籤。
- 目前 PDF 搜尋只查當前 PDF，支援多個定址碼標籤並一次圈選所有命中結果。

## 2026-08-28 儲存圈選圖片

- PDF 工具列新增「存圖」按鈕。
- 只有已開啟 PDF 且目前有搜尋圈選標記時可按。
- 存圖會將目前頁面的 PDF canvas 與該頁圈選橢圓、標籤文字合成為 PNG 下載。
- 匯出的是目前頁面，不是整份 PDF；若標記在其他頁，需先切到該頁再存圖。
- 2026-08-28 後續修正：iPhone/Safari/Chrome 不可靠支援 `data:image/png` 搭配 `<a download>`，已改為用 Blob/File。桌機直接下載；手機/平板開啟圖片預覽並優先呼叫 Web Share API 分享圖片，另提供下載備援與長按圖片保存。
- 2026-08-29 後續修正：存圖不再複製目前螢幕顯示的 PDF canvas，也不讀取 DOM marker 尺寸；改為用 PDF.js 以固定 2x 比例重新渲染目前頁面，並用索引座標重新畫圈，避免手機縮放比例造成匯出圖片圈選過大。

## 2026-08-28 搜尋與結果跳轉

- 使用者按全域搜尋或目前 PDF 搜尋後，頁面會自動滑到搜尋結果區，並短暫高亮結果面板。
- 使用者點選搜尋結果後，會開啟對應 PDF、圈選該筆標籤，再自動滑回圖面工作區並短暫高亮。
- 手機寬度 430px 驗證：搜尋後 `.results-panel` top 約 12px；點結果後 `.workspace` top 約 12px；無水平溢出。

## 2026-08-29 手機縮放手感

- 原本兩指縮放會在手指移動時排程 PDF.js 重渲染，手機上容易看起來像倍率跳段。
- 已改為 pinch 過程用 CSS transform 即時預覽縮放，放開手指後才用 PDF.js 重渲染到最後倍率，讓互動更滑順並保留清晰度。
- 後續修正聚焦偏左：pinch 預覽不再固定從 PDF 左上角縮放，改用兩指中點在 PDF 頁面內的位置作為 `transform-origin`；重渲染後也用 PDF 頁面比例維持焦點，避免 PDF 置中 margin 造成焦點偏移。
- PDF 工具列新增縮放百分比顯示，位於「適合」與「放大」之間；按鈕縮放、滾輪縮放與手機 pinch 預覽時都會更新。
- 最大縮放由 400% 提高到 800%，並加入 canvas bitmap 像素上限，避免手機高倍縮放時產生過大的畫布造成卡頓或黑屏。
- 手機/平板搜尋輸入框字級固定至少 16px，避免 iPhone 聚焦輸入時自動放大頁面造成搜尋列需左右滑動。


## 排查問題前的標準流程

遇到使用者回報「搜尋不到」或「資料不對」時，先讀取 `README.md` 與 `dev-guide.html` 的說明，確認是否為已知操作問題（例如更新 PDF 後未重建索引），再進入程式碼層面排查。

常見原因清單：

1. **更新 PDF 後未執行 `node scripts/build-index.js`** — 這是最常見的原因。
2. 瀏覽器快取未清除 — 按 `Ctrl + F5` 強制重新整理。
3. 線上版未重新部署 — 推送 GitHub 後 Vercel 會自動部署，但需確認。
