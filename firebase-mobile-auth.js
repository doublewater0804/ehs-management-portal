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

  // The task module keeps its large legacy page intact. Load its extensions
  // only on /task/ so other EHS modules are unaffected.
  const isTaskModule = /\/task\/(?:index\.html)?$/.test(window.location.pathname);
  if (isTaskModule) {
    if (!document.querySelector('link[data-ehs-task-basic-data-layout]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = './basic-data-layout.css?v=6';
      link.dataset.ehsTaskBasicDataLayout = '1';
      document.head.appendChild(link);
    }

    if (!document.querySelector('script[data-ehs-task-basic-data]')) {
      const script = document.createElement('script');
      script.src = './basic-data.js?v=6';
      script.defer = true;
      script.dataset.ehsTaskBasicData = '1';
      document.head.appendChild(script);
    }

    if (!document.querySelector('script[data-ehs-task-basic-data-tab-structure]')) {
      const structurePatch = document.createElement('script');
      structurePatch.src = './basic-data-tab-structure.js?v=6';
      structurePatch.defer = true;
      structurePatch.dataset.ehsTaskBasicDataTabStructure = '1';
      document.head.appendChild(structurePatch);
    }

    if (!document.querySelector('script[data-ehs-task-personnel-assignment]')) {
      const personnel = document.createElement('script');
      personnel.src = './personnel-assignment.js?v=3';
      personnel.defer = true;
      personnel.dataset.ehsTaskPersonnelAssignment = '1';
      document.head.appendChild(personnel);
    }
  }
}