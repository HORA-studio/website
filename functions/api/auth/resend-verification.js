// POST /api/auth/resend-verification — gui lai email xac thuc cho khach
// dang dang nhap (bat buoc dang nhap). Token cu chua dung bi huy, chi token
// moi nhat con hieu luc. Chua cau hinh mail -> mailSent:false,
// mailConfigured:false de UI bao dung ly do (khong bao loi chung chung).
import { json, errorJson, requireAuth, getEmailVerifiedAt, issueAuthToken, siteUrl } from "../_lib.js";
import { logEvent, clientIp } from "../_log.js";
import { isMailConfigured, sendVerificationEmail } from "../_mail.js";

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.response) return a.response;
  const { customer } = a;

  const verifiedAt = await getEmailVerifiedAt(env, customer.id);
  if (verifiedAt) return json({ ok: true, alreadyVerified: true });

  const mailConfigured = isMailConfigured(env);
  let mailSent = false;
  try {
    const token = await issueAuthToken(env, customer.id, "verify_email", 24 * 3600 * 1000);
    const link = `${siteUrl(env)}/account.html?verify=${token}`;
    const result = await sendVerificationEmail(env, { to: customer.email, customerId: customer.id, link });
    mailSent = result.sent;
  } catch (err) {
    console.warn("resend-verification failed:", err && err.message ? err.message : String(err));
  }
  await logEvent(env, { eventType: "auth.verification_resent", customerId: customer.id, ip: clientIp(request), details: { mailConfigured, mailSent } });
  return json({ ok: true, mailConfigured, mailSent });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}
