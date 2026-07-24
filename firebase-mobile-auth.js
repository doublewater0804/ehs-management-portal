const STYLE_ID = "ehs-firebase-auth-style";
const GATE_ID = "ehs-firebase-auth-gate";
const BADGE_ID = "ehs-firebase-auth-badge";

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${GATE_ID}{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.72);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-family:"Noto Sans TC","Microsoft JhengHei",Arial,sans-serif}
    #${GATE_ID} .ehs-auth-card{width:min(440px,100%);background:#fff;color:#172033;border-radius:20px;padding:24px;box-shadow:0 24px 70px rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.55)}
    #${GATE_ID} .ehs-auth-icon{width:52px;height:52px;border-radius:16px;display:grid;place-items:center;background:#eaf2ff;font-size:26px;margin-bottom:14px}
    #${GATE_ID} h2{font-size:21px;line-height:1.4;margin:0 0 8px;font-weight:900}
    #${GATE_ID} p{font-size:14px;line-height:1.75;color:#64748b;margin:0 0 16px}
    #${GATE_ID} .ehs-auth-status{font-size:12px;line-height:1.6;padding:9px 11px;border-radius:10px;background:#f1f5f9;color:#475569;margin-bottom:14px;word-break:break-word}
    #${GATE_ID} .ehs-auth-status.error{background:#fff1f2;color:#be123c;border:1px solid #fecdd3}
    #${GATE_ID} button{width:100%;min-height:46px;border:0;border-radius:12px;background:#2563eb;color:#fff;font-size:15px;font-weight:800;cursor:pointer;padding:10px 14px}
    #${GATE_ID} button:disabled{opacity:.55;cursor:wait}
    #${GATE_ID} .ehs-auth-note{font-size:11px;color:#94a3b8;margin-top:12px;text-align:center}
    #${BADGE_ID}{position:fixed;right:12px;bottom:12px;z-index:2147483645;display:flex;align-items:center;gap:8px;max-width:min(460px,calc(100vw - 24px));padding:8px 10px;border-radius:999px;background:rgba(255,255,255,.96);color:#166534;border:1px solid #bbf7d0;box-shadow:0 8px 28px rgba(15,23,42,.16);font:700 11px/1.4 "Noto Sans TC","Microsoft JhengHei",Arial,sans-serif}
    #${BADGE_ID} .ehs-auth-email{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #${BADGE_ID} button{flex:none;border:0;background:#eef2ff;color:#3730a3;border-radius:999px;padding:5px 8px;font-family:inherit;font-size:11px;font-weight:800;line-height:1.2;cursor:pointer}
    @media (max-width:640px){#${GATE_ID}{align-items:flex-start;padding-top:max(24px,env(safe-area-inset-top))}#${GATE_ID} .ehs-auth-card{margin-top:8vh;padding:21px}#${BADGE_ID}{right:8px;bottom:max(8px,env(safe-area-inset-bottom))}}
  `;
  document.head.appendChild(style);
}

function friendlyError(error) {
  const code = error?.code || "unknown";
  const detail = error?.message || String(error || "未知錯誤");
  const map = {
    "auth/popup-blocked": "瀏覽器阻擋了登入視窗。請再按一次登入按鈕，並允許本次 Google 登入視窗。",
    "auth/popup-closed-by-user": "Google 登入視窗已關閉，請重新按登入。",
    "auth/cancelled-popup-request": "登入視窗已被另一個登入要求取代，請重新按登入。",
    "auth/unauthorized-domain": "Firebase 尚未授權目前的 GitHub Pages 網域。請在 Firebase Authorized domains 加入 doublewater0804.github.io。",
    "auth/web-storage-unsupported": "瀏覽器目前無法保存 Firebase 登入狀態。請確認不是私密瀏覽模式，且沒有封鎖所有 Cookie。",
    "auth/network-request-failed": "Firebase 登入網路連線失敗。請確認網路、VPN、DNS 或內容阻擋器。",
    "auth/account-exists-with-different-credential": "此電子郵件已使用其他登入方式建立，請改用原登入方式。"
  };
  return `${map[code] || "Google 登入失敗。"}\n錯誤碼：${code}\n${detail}`;
}

function removeGate() {
  document.getElementById(GATE_ID)?.remove();
}

function renderBadge({ user, moduleName, signOut, onSignedOut }) {
  document.getElementById(BADGE_ID)?.remove();
  const badge = document.createElement("div");
  badge.id = BADGE_ID;
  const icon = document.createElement("span");
  icon.textContent = "☁️";
  const email = document.createElement("span");
  email.className = "ehs-auth-email";
  email.title = user.email || user.uid || "Firebase 已登入";
  email.textContent = `${moduleName}｜${user.email || "Firebase 已登入"}`;
  badge.append(icon, email);
  if (typeof signOut === "function") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "切換帳號";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await signOut();
        badge.remove();
        if (typeof onSignedOut === "function") onSignedOut();
        location.reload();
      } catch (error) {
        console.error("Firebase 登出失敗", error);
        button.disabled = false;
      }
    });
    badge.appendChild(button);
  }
  document.body.appendChild(badge);
}

export async function requireFirebaseUser({
  auth,
  provider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
  moduleName = "EHS 系統"
}) {
  ensureStyle();

  if (typeof setPersistence === "function" && browserLocalPersistence) {
    try {
      await setPersistence(auth, browserLocalPersistence);
    } catch (error) {
      console.warn("Firebase Auth persistence 設定失敗，改用瀏覽器可用的預設模式。", error);
    }
  }

  return new Promise((resolve) => {
    let resolved = false;
    let gate;
    let status;
    let loginButton;

    const showGate = () => {
      if (document.getElementById(GATE_ID)) return;
      gate = document.createElement("div");
      gate.id = GATE_ID;
      gate.innerHTML = `
        <div class="ehs-auth-card" role="dialog" aria-modal="true" aria-labelledby="ehs-auth-title">
          <div class="ehs-auth-icon">☁️</div>
          <h2 id="ehs-auth-title">Firebase 雲端資料登入</h2>
          <p>「${moduleName}」需要先完成 Firebase Google 登入，才會讀取與同步雲端資料。請使用與電腦相同的 Google 帳號。</p>
          <div class="ehs-auth-status">正在確認既有登入狀態…</div>
          <button type="button" disabled>使用 Google 登入並讀取雲端資料</button>
          <div class="ehs-auth-note">登入視窗由您按下按鈕後才開啟，可改善 iPad Safari／Chrome 阻擋自動彈出視窗的問題。</div>
        </div>`;
      document.body.appendChild(gate);
      status = gate.querySelector(".ehs-auth-status");
      loginButton = gate.querySelector("button");

      loginButton.addEventListener("click", async () => {
        loginButton.disabled = true;
        status.classList.remove("error");
        status.textContent = "正在開啟 Google 登入視窗…";
        try {
          provider.setCustomParameters?.({ prompt: "select_account" });
          const result = await signInWithPopup(auth, provider);
          status.textContent = `登入成功：${result.user?.email || "正在載入雲端資料"}`;
        } catch (error) {
          console.error("Firebase Google 登入失敗", error);
          status.classList.add("error");
          status.style.whiteSpace = "pre-line";
          status.textContent = friendlyError(error);
          loginButton.disabled = false;
        }
      });
    };

    showGate();

    onAuthStateChanged(auth, (user) => {
      if (user) {
        removeGate();
        renderBadge({
          user,
          moduleName,
          signOut: typeof signOut === "function" ? () => signOut(auth) : null
        });
        if (!resolved) {
          resolved = true;
          resolve(user);
        }
        return;
      }

      if (!resolved) {
        showGate();
        status = document.querySelector(`#${GATE_ID} .ehs-auth-status`);
        loginButton = document.querySelector(`#${GATE_ID} button`);
        if (status) status.textContent = "尚未登入 Firebase，請按下方按鈕。";
        if (loginButton) loginButton.disabled = false;
      }
    }, (error) => {
      console.error("Firebase 登入狀態檢查失敗", error);
      showGate();
      status = document.querySelector(`#${GATE_ID} .ehs-auth-status`);
      loginButton = document.querySelector(`#${GATE_ID} button`);
      if (status) {
        status.classList.add("error");
        status.style.whiteSpace = "pre-line";
        status.textContent = friendlyError(error);
      }
      if (loginButton) loginButton.disabled = false;
    });
  });
}

export function firebaseErrorText(error, prefix = "Firebase 操作失敗") {
  const code = error?.code || "unknown";
  const detail = error?.message || String(error || "未知錯誤");
  return `${prefix}（${code}）：${detail}`;
}

if (typeof window !== "undefined") {
  window.__firebaseErrorText = firebaseErrorText;
}
