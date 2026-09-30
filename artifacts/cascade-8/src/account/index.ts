import "./styles.css";
import { accountApi, AuthApiError, type AccountUser } from "./api";

type AuthMode = "login" | "register";

const formatMoney = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

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
        <h1>PROFİLİNİ <em>OLUŞTUR</em></h1>
        <p>Email, kullanıcı adı ve şifrenle tek hesabını oluştur. Şimdilik e-posta doğrulaması zorunlu değil; hesabın ortak bakiyen ve tüm oyun kimliğinle birlikte çalışır.</p>
        <div class="account-security-points">
          <span><b>01</b> Scrypt parola koruması</span>
          <span><b>02</b> HttpOnly hesap oturumu</span>
          <span><b>03</b> Tek hesap · tek ortak wallet</span>
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
            <p id="account-subtitle">E-posta veya kullanıcı adın ve şifrenle devam et.</p>
          </div>

          <form id="account-form" novalidate>
            <label>
              <span id="account-identity-label">E-POSTA / KULLANICI ADI</span>
              <input id="account-identity" name="identity" type="text" autocomplete="username" placeholder="email veya kullanıcı adı" maxlength="254" required />
            </label>

            <label id="account-username-wrap" hidden>
              <span>KULLANICI ADI</span>
              <input id="account-username" name="username" type="text" autocomplete="username" minlength="3" maxlength="20" pattern="[a-zA-Z0-9_]+" placeholder="ornek_kullanici" />
              <small class="account-field-note">3–20 karakter · harf, rakam ve _</small>
            </label>

            <label>
              <span>ŞİFRE</span>
              <input id="account-password" name="password" type="password" autocomplete="current-password" minlength="8" maxlength="128" placeholder="En az 8 karakter" required />
            </label>

            <label id="account-confirm-wrap" hidden>
              <span>ŞİFRE TEKRAR</span>
              <input id="account-confirm" name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" placeholder="Şifreyi tekrar yaz" />
            </label>

            <div id="account-error" class="account-error" role="alert" hidden></div>
            <button id="account-submit" class="account-submit" type="submit">
              <span id="account-submit-label">GİRİŞ YAP</span>
              <b>→</b>
            </button>
          </form>
        </div>

        <div id="account-profile" class="account-profile" hidden>
          <div class="account-profile-head">
            <span class="account-profile-kicker">OYUNCU PROFİLİ</span>
            <div id="account-avatar" class="account-avatar">P</div>
            <h2 id="account-profile-username">—</h2>
            <strong id="account-profile-code">0000-0000-00</strong>
          </div>

          <div class="account-profile-grid">
            <div>
              <span>BAKİYE</span>
              <b id="account-profile-balance">$0.00</b>
            </div>
            <div>
              <span>E-POSTA</span>
              <b id="account-profile-email">—</b>
            </div>
            <div>
              <span>KULLANICI ADI</span>
              <b id="account-profile-username-detail">—</b>
            </div>
            <div>
              <span>USERCODE</span>
              <b id="account-profile-code-detail">—</b>
            </div>
          </div>

          <form id="account-password-form" class="account-password-form" novalidate>
            <div class="account-password-heading">
              <span>GÜVENLİK</span>
              <strong>Şifre değiştir</strong>
            </div>
            <label>
              <span>MEVCUT ŞİFRE</span>
              <input id="account-current-password" type="password" autocomplete="current-password" minlength="8" maxlength="128" required />
            </label>
            <label>
              <span>YENİ ŞİFRE</span>
              <input id="account-new-password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required />
            </label>
            <label>
              <span>YENİ ŞİFRE TEKRAR</span>
              <input id="account-new-password-confirm" type="password" autocomplete="new-password" minlength="8" maxlength="128" required />
            </label>
            <p id="account-password-note" class="account-password-note" hidden></p>
            <button id="account-password-submit" class="account-resend-verification" type="submit">ŞİFREYİ GÜNCELLE</button>
          </form>

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
    INVALID_USERNAME: "Kullanıcı adı 3–20 karakter olmalı; yalnız harf, rakam ve _ kullan.",
    INVALID_PASSWORD: "Şifre 8–128 karakter arasında olmalı.",
    EMAIL_ALREADY_REGISTERED: "Bu e-posta adresiyle zaten bir hesap var.",
    USERNAME_ALREADY_REGISTERED: "Bu kullanıcı adı daha önce alınmış.",
    WALLET_ALREADY_LINKED: "Bu oyun oturumu zaten başka bir hesaba bağlı.",
    INVALID_EMAIL_OR_PASSWORD: "E-posta/kullanıcı adı veya şifre hatalı.",
    CURRENT_PASSWORD_INVALID: "Mevcut şifre doğru değil.",
    AUTH_REQUIRED: "Bu işlem için tekrar giriş yapmalısın.",
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
  const identity = app.querySelector<HTMLInputElement>("#account-identity")!;
  const identityLabel = app.querySelector<HTMLElement>("#account-identity-label")!;
  const usernameWrap = app.querySelector<HTMLElement>("#account-username-wrap")!;
  const username = app.querySelector<HTMLInputElement>("#account-username")!;
  const password = app.querySelector<HTMLInputElement>("#account-password")!;
  const confirmWrap = app.querySelector<HTMLElement>("#account-confirm-wrap")!;
  const confirm = app.querySelector<HTMLInputElement>("#account-confirm")!;
  const errorBox = app.querySelector<HTMLElement>("#account-error")!;
  const submit = app.querySelector<HTMLButtonElement>("#account-submit")!;
  const submitLabel = app.querySelector<HTMLElement>("#account-submit-label")!;
  const title = app.querySelector<HTMLElement>("#account-title")!;
  const eyebrow = app.querySelector<HTMLElement>("#account-eyebrow")!;
  const subtitle = app.querySelector<HTMLElement>("#account-subtitle")!;
  const avatar = app.querySelector<HTMLElement>("#account-avatar")!;
  const profileUsername = app.querySelector<HTMLElement>("#account-profile-username")!;
  const profileUsernameDetail = app.querySelector<HTMLElement>("#account-profile-username-detail")!;
  const profileCode = app.querySelector<HTMLElement>("#account-profile-code")!;
  const profileCodeDetail = app.querySelector<HTMLElement>("#account-profile-code-detail")!;
  const profileEmail = app.querySelector<HTMLElement>("#account-profile-email")!;
  const profileBalance = app.querySelector<HTMLElement>("#account-profile-balance")!;
  const passwordForm = app.querySelector<HTMLFormElement>("#account-password-form")!;
  const currentPassword = app.querySelector<HTMLInputElement>("#account-current-password")!;
  const newPassword = app.querySelector<HTMLInputElement>("#account-new-password")!;
  const newPasswordConfirm = app.querySelector<HTMLInputElement>("#account-new-password-confirm")!;
  const passwordNote = app.querySelector<HTMLElement>("#account-password-note")!;
  const passwordSubmit = app.querySelector<HTMLButtonElement>("#account-password-submit")!;
  const logout = app.querySelector<HTMLButtonElement>("#account-logout")!;
  const tabs = [...app.querySelectorAll<HTMLButtonElement>("[data-mode]")];

  let mode: AuthMode = "login";

  function setBusy(busy: boolean) {
    submit.disabled = busy;
    identity.disabled = busy;
    username.disabled = busy;
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
    avatar.textContent = user.username.slice(0, 1).toUpperCase() || "P";
    profileUsername.textContent = user.username;
    profileUsernameDetail.textContent = user.username;
    profileCode.textContent = user.userCode;
    profileCodeDetail.textContent = user.userCode;
    profileEmail.textContent = user.email;
    profileBalance.textContent = formatMoney(user.balanceCents);
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
    usernameWrap.hidden = !registering;
    username.required = registering;
    confirmWrap.hidden = !registering;
    confirm.required = registering;
    identity.type = registering ? "email" : "text";
    identity.inputMode = registering ? "email" : "text";
    identity.autocomplete = registering ? "email" : "username";
    identity.placeholder = registering ? "sen@ornek.com" : "email veya kullanıcı adı";
    identityLabel.textContent = registering ? "E-POSTA" : "E-POSTA / KULLANICI ADI";
    password.autocomplete = registering ? "new-password" : "current-password";
    eyebrow.textContent = registering ? "NEW PLAYER" : "WELCOME BACK";
    title.textContent = registering ? "Hesap oluştur" : "Giriş yap";
    subtitle.textContent = registering
      ? "E-posta, kullanıcı adı ve şifreni belirle. Doğrulama maili şu an gerekmiyor."
      : "E-posta veya kullanıcı adın ve şifrenle devam et.";
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

    const identityValue = identity.value.trim();
    const usernameValue = username.value.trim();
    const passwordValue = password.value;

    if (!identityValue || !passwordValue) {
      showError("Gerekli alanları doldur.");
      return;
    }
    if (passwordValue.length < 8 || passwordValue.length > 128) {
      showError("Şifre 8–128 karakter arasında olmalı.");
      return;
    }
    if (mode === "register") {
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(usernameValue)) {
        showError("Kullanıcı adı 3–20 karakter olmalı; yalnız harf, rakam ve _ kullan.");
        return;
      }
      if (passwordValue !== confirm.value) {
        showError("Şifreler birbiriyle eşleşmiyor.");
        return;
      }
    }

    setBusy(true);
    try {
      const result =
        mode === "register"
          ? await accountApi.register(identityValue, usernameValue, passwordValue)
          : await accountApi.login(identityValue, passwordValue);
      if (!result.user) throw new Error("AUTH_REQUEST_FAILED");
      form.reset();
      showProfile(result.user);
    } catch (error) {
      showError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  });

  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    passwordNote.hidden = true;

    if (newPassword.value !== newPasswordConfirm.value) {
      passwordNote.textContent = "Yeni şifreler birbiriyle eşleşmiyor.";
      passwordNote.dataset.state = "error";
      passwordNote.hidden = false;
      return;
    }

    passwordSubmit.disabled = true;
    const original = passwordSubmit.textContent;
    passwordSubmit.textContent = "GÜNCELLENİYOR...";

    try {
      const result = await accountApi.changePassword(
        currentPassword.value,
        newPassword.value,
      );
      if (result.user) showProfile(result.user);
      passwordForm.reset();
      passwordNote.textContent = "Şifren güncellendi. Diğer açık hesap oturumları kapatıldı.";
      passwordNote.dataset.state = "success";
      passwordNote.hidden = false;
    } catch (error) {
      passwordNote.textContent = errorMessage(error);
      passwordNote.dataset.state = "error";
      passwordNote.hidden = false;
    } finally {
      passwordSubmit.disabled = false;
      passwordSubmit.textContent = original;
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
