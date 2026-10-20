# Firebase 權限規則：每周安全永續組工作重點

這是「新增」規則，不可直接用這個檔案全面覆蓋既有 Firestore／Storage 規則，否則會破壞入口網站其他管理功能。

## 1. Firestore Rules

在原有 `service cloud.firestore { match /databases/{database}/documents { ... } }` 節點**內**新增：

```javascript
match /ehs_weekly_focus/{documentId} {
  allow read, write: if request.auth != null
    && request.auth.token.email_verified == true
    && request.auth.token.email == 'doublewater0804@gmail.com';
}
```

安全性要求：這條規則必須與原本其他 `match` 共同存在。**要檢查更廣泛的父層規則或全域通配規則是否允許未授權讀取**，因為 Firestore 的不同 allow 規則是 OR 關係。

## 2. Firebase Storage Rules

在原有 `service firebase.storage { match /b/{bucket}/o { ... } }` 節點**內**新增：

```javascript
match /weekly-focus/{uid}/{filename} {
  allow read, delete: if request.auth != null
    && request.auth.uid == uid
    && request.auth.token.email_verified == true
    && request.auth.token.email == 'doublewater0804@gmail.com';

  allow create, update: if request.auth != null
    && request.auth.uid == uid
    && request.auth.token.email_verified == true
    && request.auth.token.email == 'doublewater0804@gmail.com'
    && request.resource.size < 10 * 1024 * 1024
    && request.resource.contentType == 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}
```

未驗證登入、非管理員 Google 帳號皆不應有讀／寫能力。不可對 `weekly-focus/` 增加 `allow read: if true;`。

## 3. Firebase 專案驗證

- Firebase 專案：`esh-v85`（與入口網站 `portal/config.js` 相同）
- Authentication：Google provider 已開啟，Authorized Domains 含 `doublewater0804.github.io`
- Cloud Firestore：已建立並更新 Rules
- Cloud Storage：已建立 Bucket 並更新 Rules；如 Firebase 方案要求額外設定，必須先啟用
- Google login 帳號 `doublewater0804@gmail.com` 的 token email_verified 必須為 true
- 正式網頁存放 GitHub Pages（公開靜態 HTML/JS），**真正機密檔案僅存於 Firebase Storage**

規則部署後，務必測試：未登入、錯誤 Google 帳號、正確管理員帳號的存取行為。

## 4. 單一最新版本與清理

應用每次先上傳新檔，成功更新 Firestore 版本指標後才刪除舊檔，以防覆蓋一半。
因 Firebase Storage 與 Firestore 沒有跨服務原子交易，斷線或刪除失敗可能留下「孤兒檔案」。系統會提示清理失敗。若需嚴格自動清理所有舊檔（包含瀏覽器中斷時），需額外部署 Cloud Functions 定期整理或設定後端保留政策。

## 5. Excel 資料安全

原始 `.xls` 與轉換後 `.xlsx` **不得放在 GitHub 任何公開資料夾**（包括 `data/`）。
網頁登入是使用者介面；只有上述 Firestore／Storage 伺服器規則才能實際保護資料。不要將管理者 Token 或 Firebase 私密 Service Account 金鑰寫進程式。
