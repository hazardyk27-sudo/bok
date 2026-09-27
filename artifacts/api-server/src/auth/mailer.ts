type ResendSendResult = {
  id?: string;
  message?: string;
  name?: string;
};

function requiredEnv(name: "RESEND_API_KEY" | "RESEND_FROM_EMAIL") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("EMAIL_DELIVERY_NOT_CONFIGURED");
  return value;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendVerificationEmail(input: {
  to: string;
  verificationUrl: string;
  verificationId: string;
}) {
  const apiKey = requiredEnv("RESEND_API_KEY");
  const from = requiredEnv("RESEND_FROM_EMAIL");
  const verificationUrl = escapeHtml(input.verificationUrl);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `verify-email/${input.verificationId}`,
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: "E-posta adresini doğrula · Fahrinin Yolu",
      html: `
        <div style="background:#070a15;color:#eef3ff;font-family:Arial,sans-serif;padding:40px 20px">
          <div style="max-width:560px;margin:0 auto;background:#101832;border:1px solid #27466d;border-radius:20px;padding:32px">
            <div style="font-size:12px;letter-spacing:2px;color:#70d5ff;margin-bottom:12px">FAHRİNİN YOLU</div>
            <h1 style="margin:0 0 14px;font-size:28px;color:#ffffff">E-posta adresini doğrula</h1>
            <p style="margin:0 0 24px;line-height:1.65;color:#aab8d5">Hesabını tamamlamak için aşağıdaki butona tıkla. Bu doğrulama bağlantısı 24 saat geçerlidir.</p>
            <a href="${verificationUrl}" style="display:inline-block;background:#1f78d1;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">E-POSTAMI DOĞRULA</a>
            <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#6f7d9c">Bu hesabı sen açmadıysan bu mesajı yok sayabilirsin.</p>
          </div>
        </div>
      `,
      text: `Fahrinin Yolu hesabını doğrulamak için bu bağlantıyı aç: ${input.verificationUrl}\n\nBağlantı 24 saat geçerlidir.`,
      tags: [{ name: "category", value: "email_verification" }],
    }),
  });

  const body = (await response.json().catch(() => ({}))) as ResendSendResult;
  if (!response.ok || !body.id) {
    throw new Error("EMAIL_DELIVERY_FAILED");
  }

  return { id: body.id };
}
