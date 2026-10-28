# 薪時記

免登入、資料存在自己裝置上的薪資與工時紀錄器。

## 功能

- 上班／下班即時計時
- 以上下班時間或總時數新增紀錄
- 自動扣除休息時間與計算一般、加班工時
- 自訂時薪、正常工時、加班倍率、津貼與備註
- 每月薪資、工時與每週累計統計
- IndexedDB 裝置內儲存，另有 localStorage 備援
- JSON 匯出／匯入備份
- PWA，可加入手機主畫面並支援離線開啟

## 本機執行

需要 Node.js 22 以上版本。

```bash
npm ci
npm run dev
```

Windows PowerShell 若限制執行 `npm.ps1`，可使用 `npm.cmd ci`、`npm.cmd run dev` 等同等指令。

## 工時與備份規則

- 加班時數留白代表自動計算，該筆超過每日正常工時的部分列為加班；填入數字則維持手動指定。
- 同一天的多筆紀錄各自計算、不合併（同日可能是不同工作）。同一雇主的分段班如需合併計算加班，請在加班欄手動填入。
- 自動計算使用紀錄建立時的每日正常工時設定。
- 跨日班次請確認下班日期；超過 24 小時的計時也會保留完整日期。整筆工時與薪資歸入上班日期。
- 舊版備份缺少加班模式，會保留原有時數為手動指定。若要改成自動計算，可編輯該筆紀錄並清空加班時數。
- 匯入會完整驗證備份，再取代目前資料。設定中的無效欄位（例如舊版清空的預設上班時間）會改回預設值，工時紀錄則必須全部有效。兩種裝置儲存會比較更新時間；至少一種寫入成功後才會顯示成功訊息。

## 檢查

```bash
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

回歸測試涵蓋儲存故障與復原、備份驗證、同日紀錄分開計算、編輯模式和跨日計時。建置指令可在 Windows 與 Linux 執行。

## 部署到 GitHub Pages

專案已包含 GitHub Actions。建立 GitHub repository 後，把整個專案推到 `main` 分支：

```bash
git init
git add .
git commit -m "Initial salary tracker"
git branch -M main
git remote add origin https://github.com/你的帳號/你的專案.git
git push -u origin main
```

接著到 repository 的 `Settings → Pages`，將 `Source` 設為 **GitHub Actions**。之後每次推送到 `main` 都會自動更新網站。

## 資料與隱私

工時資料不會上傳到 GitHub 或任何伺服器，而是保存在目前瀏覽器。換裝置、換瀏覽器、使用無痕模式或清除網站資料前，請先從設定匯出 JSON 備份。

## 建置

```bash
npm run build
```

靜態網站輸出於 `dist/client`。

GitHub Actions 會再自動調整專案型 Pages 的資源路徑，不需要手動填寫 repository 名稱。
