# 臺北榮民總醫院火警探測器圖面查詢

本專案是一個本機/內網使用的單頁網頁工具，用來查詢 `火警圖 PDF` 裡的火警探測器定址碼，並在 PDF 圖面上以粗紅橘色標記位置。

## 目前功能

- 自動讀取 `火警圖 PDF` 資料夾中的棟別與樓層 PDF。
- 產生 `data/fire-map-index.json`，包含探測器文字標籤與 PDF 座標。
- 左側用棟別按鈕，樓層用類似電梯按鍵，不使用下拉選單。
- 全域搜尋支援：
  - `M1-66` 或 `M166`：輸入後會變成定址碼標籤，只列出符合的棟別與樓層，不自動開圖。
  - `M1-66 M2-60`：可一次加入多個定址碼標籤並批次搜尋。
  - `長青樓 M1-66`：只列出長青樓內符合結果。
  - `長青樓 6F M2-66`：直接開啟指定樓層 PDF 並圈選標籤；若有多個定址碼標籤，會一併圈選同樓層命中的標籤。
  - `長青樓 6F`：開啟該樓層 PDF，不圈選。
- 手動選擇棟別與樓層後，第一次顯示 PDF 時會在圖面中央跳出「搜尋定址碼」。
- PDF 工具列提供目前圖面搜尋，只搜尋當前 PDF，也支援多個定址碼標籤。
- 支援 PDF 放大、縮小、適合寬度、清除標記、儲存圈選圖片、開啟原始 PDF。
- 支援滑鼠滾輪縮放、左鍵拖曳移動圖面、雙擊圈選標記放大，手機可用兩指縮放並在放大後單指拖曳。
- 版面支援桌機、平板、手機。

## 啟動方式

在 PowerShell 進入專案資料夾：

```powershell
cd C:\code\北榮火警探測器搜尋網頁
node server.js
```

瀏覽器開啟：

```text
http://localhost:4173
```

如果只是關掉瀏覽器分頁，而 `node server.js` 還在執行，重新打開上面的網址即可。

## 線上版本

目前已部署到 Vercel：

```text
https://vghtpe-fire-detector-map.vercel.app
```

## 更新 PDF 後重建索引

新增、刪除或更換 `火警圖 PDF` 內的檔案後，請執行：

```powershell
node scripts/build-index.js
```

索引會重新產生：

- `data/fire-map-index.json`
- `data/buildings.json`

之後重新整理瀏覽器即可使用新資料。

## Windows 10 背景執行與自動啟動

這個專案可以在 Windows 10 背景執行，並在使用者登入 Windows 後自動啟動。

先用 PowerShell 進入專案資料夾：

```powershell
cd C:\code\北榮火警探測器搜尋網頁
```

手動背景啟動：

```powershell
npm run win:start
```

查看狀態：

```powershell
npm run win:status
```

停止背景服務：

```powershell
npm run win:stop
```

註冊「開機後登入自動啟動」：

```powershell
npm run win:register
```

取消自動啟動並停止服務：

```powershell
npm run win:unregister
```

啟動後開啟：

```text
http://localhost:4173
```

使用手冊頁面：

```text
http://localhost:4173/manual.html
```

背景執行記錄會寫到：

```text
logs/server.out.log
logs/server.err.log
logs/server.pid
```

注意：目前腳本使用 Windows 工作排程器的「使用者登入時啟動」。也就是電腦重開機後，需要登入該 Windows 使用者，網站才會自動啟動。若要在尚未登入 Windows 前就啟動，建議改用 Windows Service 工具，例如 NSSM 或 WinSW。

## 專案結構

```text
.
├─ index.html
├─ server.js
├─ package.json
├─ README.md
├─ agent.md
├─ assets/
│  ├─ app.js
│  ├─ styles.css
│  └─ vendor/pdfjs/
├─ data/
│  ├─ buildings.json
│  └─ fire-map-index.json
├─ scripts/
│  ├─ build-index.js
│  └─ windows/
└─ 火警圖 PDF/
```

## 重要注意事項

- 目前第一版圈選的是「探測器編號文字標籤」，不是探測器圖符本體。
- PDF.js 已放在 `assets/vendor/pdfjs`，開網頁時不需要連外下載 PDF.js。
- `火警圖 PDF` 內含院區圖面。若 repository 設為公開，這些 PDF 也會公開。
- `logs/`、`tmp/`、`node_modules/` 不需要上傳。

## GitHub 上傳前建議

如果要公開 repository，建議 repo 名稱：

```text
vghtpe-fire-detector-map
```

若在另一台電腦接續開發，請先閱讀 `agent.md`，裡面有本次對話重點、設計決策、目前驗證結果與後續建議。
