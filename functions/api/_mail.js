// Gui email qua Resend (https://resend.com) — dung cho xac thuc email va
// dat lai mat khau. Xem docs/customer-accounts.md (muc "Quen mat khau +
// xac thuc email").
//
// QUYET DINH 2026-10-29 (user chot): RESEND_API_KEY DE TRONG o giai doan nay.
// Khi chua cau hinh mail, he thong BO QUA buoc gui (log 'mail.skipped') —
// tuyet doi khong throw, khong lam vo luong dang ky / quen mat khau.
// KHONG bao gio log gia tri API key; token tho chi nam trong link email.
//
// MAIL_DRY_RUN=1 (CHI dung test local): khong goi Resend, ghi log
// 'mail.dry_run' kem link hanh dong trong details de lay link tu DB events
// local. TUYET DOI khong bat tren production (link chua token tho).

import { logEvent } from "./_log.js";

export function isMailConfigured(env) {
  return !!(env && env.RESEND_API_KEY && String(env.RESEND_API_KEY).trim());
}

export function mailFrom(env) {
  return (env && env.EMAIL_FROM) || "HORA <no-reply@hora.works>";
}

/**
 * Gui 1 email. Khong bao gio throw.
 * @returns {Promise<{sent:boolean, reason?:string}>}
 *   sent:true khi Resend chap nhan; sent:false + reason khi bo qua/that bai.
 */
export async function sendEmail(env, { to, subject, html, text, customerId = null, kind = null, actionLink = null }) {
  // Dry-run (test local): uu tien truoc ca cau hinh, de lay link tu log.
  if (env && env.MAIL_DRY_RUN === "1") {
    await logEvent(env, {
      eventType: "mail.dry_run",
      customerId,
      details: { to, subject, kind, actionLink },
    });
    return { sent: false, reason: "DRY_RUN" };
  }

  if (!isMailConfigured(env)) {
    await logEvent(env, {
      eventType: "mail.skipped",
      customerId,
      details: { to, subject, kind, reason: "MAIL_NOT_CONFIGURED" },
    });
    return { sent: false, reason: "MAIL_NOT_CONFIGURED" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: mailFrom(env), to, subject, html, text }),
    });
    if (!res.ok) {
      await logEvent(env, {
        eventType: "mail.failed",
        customerId,
        details: { to, subject, kind, reason: `RESEND_HTTP_${res.status}` },
      });
      return { sent: false, reason: `RESEND_HTTP_${res.status}` };
    }
    await logEvent(env, { eventType: "mail.sent", customerId, details: { to, subject, kind } });
    return { sent: true };
  } catch (err) {
    await logEvent(env, {
      eventType: "mail.failed",
      customerId,
      details: { to, subject, kind, reason: "NETWORK_ERROR", error: err && err.message ? err.message : String(err) },
    });
    return { sent: false, reason: "NETWORK_ERROR" };
  }
}

function wrapHtml(title, bodyHtml) {
  return `<!DOCTYPE html><html lang="vi"><body style="margin:0;background:#0b1417;color:#e9f2f3;font:15px/1.55 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<h1 style="font-size:20px;margin:0 0 12px;color:#f2cd63">${title}</h1>
${bodyHtml}
<p style="color:#93a8ad;font-size:13px;margin-top:24px">Email này được gửi tự động từ HORA Media (hora.works). Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
</div></body></html>`;
}

function actionButton(link, label) {
  return `<p style="margin:20px 0"><a href="${link}" style="background:#e2b33c;color:#1d1603;padding:11px 20px;border-radius:9px;text-decoration:none;font-weight:700">${label}</a></p>
<p style="color:#93a8ad;font-size:13px">Hoặc mở link này trong trình duyệt:<br><a href="${link}" style="color:#f2cd63;word-break:break-all">${link}</a></p>`;
}

// Email xac thuc dia chi khi dang ky (link het han sau 24 gio).
export function sendVerificationEmail(env, { to, customerId, link }) {
  const subject = "Xác thực email của bạn — HORA";
  const html = wrapHtml("Xác thực email của bạn",
    `<p>Cảm ơn bạn đã đăng ký tài khoản HORA. Bấm nút dưới đây để xác thực địa chỉ email này. Link có hiệu lực trong <strong>24 giờ</strong>.</p>
${actionButton(link, "Xác thực email")}`);
  const text = `Cảm ơn bạn đã đăng ký tài khoản HORA. Mở link sau để xác thực email (có hiệu lực 24 giờ):\n${link}\n\nNếu bạn không đăng ký, hãy bỏ qua email này.`;
  return sendEmail(env, { to, subject, html, text, customerId, kind: "verify_email", actionLink: link });
}

// Email dat lai mat khau (link het han sau 1 gio, dung 1 lan).
export function sendPasswordResetEmail(env, { to, customerId, link }) {
  const subject = "Đặt lại mật khẩu — HORA";
  const html = wrapHtml("Đặt lại mật khẩu",
    `<p>Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản HORA gắn với email này. Bấm nút dưới đây để đặt mật khẩu mới. Link có hiệu lực trong <strong>1 giờ</strong> và chỉ dùng được một lần.</p>
${actionButton(link, "Đặt lại mật khẩu")}`);
  const text = `Mở link sau để đặt lại mật khẩu HORA (có hiệu lực 1 giờ, chỉ dùng 1 lần):\n${link}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu của bạn không thay đổi.`;
  return sendEmail(env, { to, subject, html, text, customerId, kind: "reset_password", actionLink: link });
}
