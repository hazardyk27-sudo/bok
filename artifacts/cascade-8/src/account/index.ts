import "./styles.css";
import { accountApi, AuthApiError, type AccountUser } from "./api";

type AuthMode = "login" | "register";

const shell = () => `
  <div class="account-shell">
    <div class="account-ambient account-ambient-a"></div>
    <div class="account-ambient account-ambient-b"></div>

    <header class="account-topbar">
      <a class="account-brand" href="/" aria-label="Ana menüye dön">
        <span class="account-brand-mark">✦</span>
        <span>
          <strong>FAHRİNİN <em>YOLU</em></strong>
          <small>PLAYER ACCOUNT</small>
        </span>
      </a>
      <a class="account-back" href="/">← OYUNLARA DÖN</a>
    </header>

    <main class="account-main">
      <section class="account-copy">
        <span class="account-kicker">TEK HESAP · TÜM OYUNLAR</span>
        <h1>OYUNA <em>DEVAM ET</em></h1>
        <p>Hesabınla giriş yap. Oturumun güvenli şekilde korunur ve hesabın tüm oyun deneyiminin ortak kimliği olur.</p>
        <div class="account-security-points">
          <span><b>01</b> Güvenli parola hash'i</span>
          <span><b>02</b> HttpOnly oturum cookie'si</span>
          <span><b>03</b> Sunucu taraflı oturum kontrolü</span>
        </div>
      </section>

      <section class="account-card" aria-live="polite">
        <div id="account-loading" class="account-loading">
          <span class="account-loader"></span>
          <strong>HESAP KONTROL EDİLİYOR</strong>
        </div>

        <div id="account-auth" hidden>
          <div class="account-tabs" role="tablist" aria-label="Hesap işlemleri">
            <button type="button" data-mode="login" class="is-active" role="tab">GİRİŞ YAP</button>
            <button type="button" data-mode="register" role="tab">HESAP AÇ</button>
          </div>

          <div class="account-heading">
            <span id="account-eyebrow">WELCOME BACK</span>
            <h2 id="account-title">Giriş yap</h2>
            <p id="account-subtitle">E-posta adresin ve parolanla devam et.</p>
          </div>

          <form id="account-form" novalidate>
            <label>
              <span>E-POSTA</span>
              <input id="account-email" name="email" type="email" inputmode="email" autocomplete="email" placeholder="sen@ornek.com" maxlength="254" required />
            </label>

            <label>
              <span>PAROLA</span>
              <input id="account-password" name="password" type="password" autocomplete="current-password" minlength="8" maxlength="128" placeholder="En az 8 karakter" required />
            </label>

            <label id="account-confirm-wrap" hidden>
              <span>PAROLA TEKRAR</span>
              <input id="account-confirm" name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" placeholder="Parolayı tekrar yaz" />
            </label>

            <div id="account-error" class="account-error" role="alert" hidden></div>
            <button id="account-submit" class="account-submit" type="submit">
              <span id="account-submit-label">GİRİŞ YAP</span>
              <b>→</b>
            </button>
          </form>
        </div>

        <div id="account-profile" class="account-profile" hidden>
          <span class="account-profile-kicker">OTURUM AÇIK</span>
          <div class="account-avatar">✓</div>
          <h2>Hoş geldin</h2>
          <strong id="account-profile-email"></strong>
          <div class="account-profile-status">
            <span>HESAP</span>
            <b>AKTİF</b>
          </div>
          <a class="account-play" href="/">OYUNLARA DEVAM ET <b>→</b></a>
          <button id="account-logout" class="account-logout" type="button">ÇIKIŞ YAP</button>
        </div>
      </section>
    </main>
  </div>
`;

function errorMessage(error: unknown) {
  const code = error instanceof AuthApiError ? error.code : "AUTH_REQUEST_FAILED";
  const messages: Record<string, string> = {
    INVALID_EMAIL: "Geçerli bir e-posta adresi gir.",
    INVALID_PASSWORD: "Parola 8–128 karakter arasında olmalı.",
    EMAIL_ALREADY_REGISTERED: "Bu e-posta adresiyle zaten bir hesap var.",
    INVALID_EMAIL_OR_PASSWORD: "E-posta veya parola hatalı.",
    AUTH_REQUEST_FAILED: "İşlem tamamlanamadı. Tekrar dene.",
  };
  return messages[code] ?? "İşlem tamamlanamadı. Tekrar dene.";
}

export function mountAccount(app: HTMLElement) {
  app.innerHTML = shell();

  const loading = app.querySelector<HTMLElement>("#account-loading")!;
  const auth = app.querySelector<HTMLElement>("#account-auth")!;
  const profile = app.querySelector<HTMLElement>("#account-profile")!;
  const form = app.querySelector<HTMLFormElement>("#account-form")!;
  const email = app.querySelector<HTMLInputElement>("#account-email")!;
  const password = app.querySelector<HTMLInputElement>("#account-password")!;
  const confirmWrap = app.querySelector<HTMLElement>("#account-confirm-wrap")!;
  const confirm = app.querySelector<HTMLInputElement>("#account-confirm")!;
  const errorBox = app.querySelector<HTMLElement>("#account-error")!;
  const submit = app.querySelector<HTMLButtonElement>("#account-submit")!;
  const submitLabel = app.querySelector<HTMLElement>("#account-submit-label")!;
  const title = app.querySelector<HTMLElement>("#account-title")!;
  const eyebrow = app.querySelector<HTMLElement>("#account-eyebrow")!;
  const subtitle = app.querySelector<HTMLElement>("#account-subtitle")!;
  const profileEmail = app.querySelector<HTMLElement>("#account-profile-email")!;
  const logout = app.querySelector<HTMLButtonElement>("#account-logout")!;
  const tabs = [...app.querySelectorAll<HTMLButtonElement>("[data-mode]")];

  let mode: AuthMode = "login";

  function setBusy(busy: boolean) {
    submit.disabled = busy;
    email.disabled = busy;
    password.disabled = busy;
    confirm.disabled = busy;
    submitLabel.textContent = busy
      ? "İŞLENİYOR..."
      : mode === "login"
        ? "GİRİŞ YAP"
        : "HESAP OLUŞTUR";
  }

  function showError(message = "") {
    errorBox.textContent = message;
    errorBox.hidden = !message;
  }

  function showProfile(user: AccountUser) {
    loading.hidden = true;
    auth.hidden = true;
    profile.hidden = false;
    profileEmail.textContent = user.email;
  }

  function showAuth() {
    loading.hidden = true;
    profile.hidden = true;
    auth.hidden = false;
  }

  function applyMode(next: AuthMode) {
    mode = next;
    showError();
    const registering = mode === "register";
    confirmWrap.hidden = !registering;
    confirm.required = registering;
    password.autocomplete = registering ? "new-password" : "current-password";
    eyebrow.textContent = registering ? "NEW PLAYER" : "WELCOME BACK";
    title.textContent = registering ? "Hesap oluştur" : "Giriş yap";
    subtitle.textContent = registering
      ? "E-posta adresin ve parolanla yeni hesabını aç."
      : "E-posta adresin ve parolanla devam et.";
    submitLabel.textContent = registering ? "HESAP OLUŞTUR" : "GİRİŞ YAP";
    tabs.forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.mode === mode);
      tab.setAttribute("aria-selected", String(tab.dataset.mode === mode));
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      applyMode(tab.dataset.mode === "register" ? "register" : "login");
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showError();

    const emailValue = email.value.trim();
    const passwordValue = password.value;
    if (!emailValue || !passwordValue) {
      showError("E-posta ve parola zorunlu.");
      return;
    }
    if (passwordValue.length < 8 || passwordValue.length > 128) {
      showError("Parola 8–128 karakter arasında olmalı.");
      return;
    }
    if (mode === "register" && passwordValue !== confirm.value) {
      showError("Parolalar birbiriyle eşleşmiyor.");
      return;
    }

    setBusy(true);
    try {
      const result =
        mode === "register"
          ? await accountApi.register(emailValue, passwordValue)
          : await accountApi.login(emailValue, passwordValue);
      if (!result.user) throw new Error("AUTH_REQUEST_FAILED");
      form.reset();
      showProfile(result.user);
    } catch (error) {
      showError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  });

  logout.addEventListener("click", async () => {
    logout.disabled = true;
    try {
      await accountApi.logout();
      applyMode("login");
      showAuth();
    } catch (error) {
      showError(errorMessage(error));
    } finally {
      logout.disabled = false;
    }
  });

  void accountApi
    .me()
    .then(({ user }) => {
      if (user) showProfile(user);
      else showAuth();
    })
    .catch(() => showAuth());
}
