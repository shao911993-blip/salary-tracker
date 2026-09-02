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
