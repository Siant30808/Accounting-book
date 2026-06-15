# 開發 & 打包流程

## ❌ 不要用 Expo Go
- 原生套件（AsyncStorage、DatePicker、SafeAreaContext 等）無法正常運作
- 網路連線不穩定，常常連不上
- 行為跟真實 APK 差很多，測不出真正的問題
- **請用下方的本地 debug build 或直接打包 APK 測試**

---

## 本地開發測試（Debug Build）

### 第一次設定
1. 開啟 Android Studio → Device Manager → 啟動虛擬機（AVD）
   或手機開啟 USB 偵錯後連接電腦
2. 在專案資料夾執行：
```bash
npx expo run:android
```
> 第一次會產生 `android/` 資料夾並編譯，需要幾分鐘

### 日常開發
- 修改程式碼後**自動熱更新**，不需要重新執行
- 所有原生功能都能正常運作

### 需要重新執行 `npx expo run:android` 的情況
- 新增或刪除套件（`npm install` 之後）
- 修改了 `app.json`
- 修改了原生設定

---

## 正式打包（Release APK）✅ 推薦

### 打包指令
```bash
cd C:\Users\siant\BudgetApp\android
.\gradlew assembleRelease
```

### APK 位置
```
C:\Users\siant\BudgetApp\android\app\build\outputs\apk\release\app-release.apk
```

### 打包速度
- **第一次**：約 15 分鐘（下載 Gradle + 編譯所有套件）
- **之後**：約 2~3 分鐘（有快取）

### 打包前記得
- [ ] `app.json` 的 `version` 有沒有更新（例如 `1.0.1`）

---

## ~~EAS 雲端打包~~（不再使用）
- 免費配額每月有限，用完要等下個月
- 本地打包更快、完全免費，不需要 EAS

---

## 推上 GitHub
```bash
git add .
git commit -m "版本說明"
git push
```

---

## 重要設定備忘
- `app.json` → `"newArchEnabled": true`
- 資料儲存使用 `AsyncStorage`（穩定，任何環境都能用）
- `android/` 資料夾不推上 GitHub（已在 .gitignore）

---

## android/ 不存在時（第一次 or 重新 clone 後）
`android/` 資料夾每次都要重新產生，且體積優化設定（ABI 限制 / R8 / ProGuard）不會保留在 git 裡。
請用以下指令一次完成「產生 + 補上優化設定」：
```bash
npm run prebuild
```
等同於：
```bash
npx expo prebuild --platform android
node scripts/patch-android.js
```
