const authGate = document.getElementById("authGate");
const authForm = document.getElementById("authForm");
const passwordInput = document.getElementById("passwordInput");
const authError = document.getElementById("authError");
const logoutBtn = document.getElementById("logoutBtn");
const appRoot = document.getElementById("appRoot");

async function sha256Hex(text) {
  const encoded = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isAuthed() {
  return sessionStorage.getItem(window.AUTH_CONFIG.SESSION_KEY) === "ok";
}

function showApp() {
  authGate.classList.add("hidden");
  appRoot.classList.remove("locked");
  if (logoutBtn) logoutBtn.classList.remove("hidden");
}

function showAuth() {
  authGate.classList.remove("hidden");
  appRoot.classList.add("locked");
  if (logoutBtn) logoutBtn.classList.add("hidden");
  setTimeout(() => passwordInput?.focus(), 80);
}

if (isAuthed()) {
  showApp();
} else {
  showAuth();
}

authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  authError.textContent = "";

  const password = passwordInput.value;
  if (!password) {
    authError.textContent = "パスワードを入力してください。";
    return;
  }

  try {
    const hash = await sha256Hex(password);
    if (hash === window.AUTH_CONFIG.PASSWORD_HASH) {
      sessionStorage.setItem(window.AUTH_CONFIG.SESSION_KEY, "ok");
      passwordInput.value = "";
      showApp();
      return;
    }
    authError.textContent = "パスワードが違います。";
    passwordInput.select();
  } catch (error) {
    authError.textContent = "認証処理に失敗しました。HTTPS環境で開いてください。";
  }
});

logoutBtn?.addEventListener("click", () => {
  sessionStorage.removeItem(window.AUTH_CONFIG.SESSION_KEY);
  showAuth();
});
