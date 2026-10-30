// POST /api/auth/register — dang ky tai khoan khach (email + mat khau >= 8 ky tu).
// Sau khi tao tai khoan: phat token xac thuc email + gui mail qua Resend.
// KHONG tao session/cookie — tai khoan chua xac thuc email thi khong dang nhap
// duoc (xem login.js). Khach phai bam link trong email roi dang nhap lai.
// Chua cau hinh mail (RESEND_API_KEY de trong) thi buoc gui bi bo qua —
// dang ky van thanh cong nhung khong the dang nhap (xem functions/api/_mail.js).
import { json, errorJson, readJson, hashPassword, issueAuthToken, siteUrl, newLicenseId, newLicenseKey, appForPlan } from "../_lib.js";
import { getPromotions, resolveTrialBenefit, trialWindow } from "../_promo.js";
import { logEvent, clientIp } from "../_log.js";
import { isMailConfigured, sendVerificationEmail } from "../_mail.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const displayName = String(body.displayName || body.display_name || "").trim().slice(0, 80) || null;

  if (!EMAIL_RE.test(email)) return errorJson("INVALID_EMAIL", "Email không đúng định dạng.", 422);
  if (password.length < 8) return errorJson("WEAK_PASSWORD", "Mật khẩu cần ít nhất 8 ký tự.", 422);

  const existing = await env.DB.prepare("SELECT id FROM customers WHERE email = ?1").bind(email).first();
  if (existing) return errorJson("EMAIL_EXISTS", "Email này đã được đăng ký.", 409);

  const { hash, salt, iterations } = await hashPassword(password);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO customers (id, email, password_hash, salt, iterations, display_name, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
  ).bind(id, email, hash, salt, iterations, displayName, new Date().toISOString()).run();

  await logEvent(env, { eventType: "auth.register", customerId: id, ip: clientIp(request) });

  // KHUYEN MAI: dang ky trong cua so -> cap license dung thu (mac dinh Plus
  // 7 ngay) ngay lap tuc. Moc dem han tuy cau hinh 'countFrom' cua dot:
  //   - 'registration' (mac dinh): han chot ngay luc tao tai khoan
  //     (expiry_utc = created_at + trialDays, activated_at = created_at).
  //   - 'activation': de expiry_utc NULL, dem tu luc bind device dau tien.
  // Idempotent theo dot: da co license 'promo' cua dot nay thi khong cap lai.
  // Moi loi o buoc nay deu bi nuot — khong duoc lam hong dang ky.
  let trial = null;
  try {
    const benefit = resolveTrialBenefit(await getPromotions(env), Date.now());
    if (benefit) {
      const marker = `promo:${benefit.promo.id}`;
      const dup = await env.DB.prepare(
        "SELECT id FROM licenses WHERE customer_id = ?1 AND organization = 'promo' AND notes LIKE ?2 LIMIT 1"
      ).bind(id, marker + "%").first();
      if (!dup) {
        const nowIso = new Date().toISOString();
        const { expiry, activatedAt } = trialWindow(benefit.promo);
        const trialId = newLicenseId();
        await env.DB.prepare(
          `INSERT INTO licenses
             (id, license_key, customer_id, app, product_id, tier, status, organization,
              expiry_utc, validity_days, activated_at, revoked_at, source, order_id, created_at, notes)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active', 'promo', ?7, ?8, ?9, NULL, 'manual', NULL, ?10, ?11)`
        ).bind(
          trialId, newLicenseKey("HORA"), id, appForPlan(benefit.tier), appForPlan(benefit.tier),
          benefit.tier, expiry, benefit.days, activatedAt, nowIso,
          `${marker}; Khuyen mai "${benefit.promo.name}": dung thu ${benefit.days} ngay khi dang ky`
        ).run();
        trial = { tier: benefit.tier, days: benefit.days, expiresAt: expiry };
        await logEvent(env, { eventType: "promo.trial_granted", customerId: id, ip: clientIp(request) });
      }
    }
  } catch (err) {
    console.warn("register: grant trial failed:", err && err.message ? err.message : String(err));
  }

  const mailConfigured = isMailConfigured(env);
  try {
    const verifyToken = await issueAuthToken(env, id, "verify_email", 24 * 3600 * 1000);
    const link = `${siteUrl(env)}/account.html?verify=${verifyToken}`;
    await sendVerificationEmail(env, { to: email, customerId: id, link });
  } catch (err) {
    console.warn("register: send verification email failed:", err && err.message ? err.message : String(err));
  }

  return json(
    { registered: true, customer: { id, email, displayName, emailVerified: false }, mailConfigured, trial },
    201
  );
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}
