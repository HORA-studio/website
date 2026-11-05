// Dang nhap Google (OAuth 2.0 authorization-code) cho tai khoan khach.
// Cau hinh: env GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (Pages secret).
// Redirect URI dang ky voi Google phai la:
//   https://hora.works/api/auth/google/callback
// (code tu suy ra tu origin cua request nen local/staging cung dung duoc
// neu da dang ky them URI tuong ung trong Google Cloud Console).
//
// Lien ket tai khoan: theo email DA XAC THUC cua Google (email_verified)
// + google_sub (cot tuy chon, xem db/migrate-google-2026-11-05.sql).
// Moi thao tac voi cot google_sub deu fail-soft: DB chua chay migration
// thi luong van chay bang email nhu thuong.
import { hashPassword, newLicenseId, newLicenseKey, appForPlan } from "./_lib.js";
import { getPromotions, resolveTrialBenefit, trialWindow } from "./_promo.js";
import { logEvent, clientIp } from "./_log.js";

export function googleConfig(env = {}) {
  return {
    clientId: String(env.GOOGLE_CLIENT_ID || "").trim(),
    clientSecret: String(env.GOOGLE_CLIENT_SECRET || "").trim(),
  };
}

export function isGoogleConfigured(env = {}) {
  const c = googleConfig(env);
  return !!(c.clientId && c.clientSecret);
}

export function googleRedirectUri(request) {
  return `${new URL(request.url).origin}/api/auth/google/callback`;
}

// Tim khach theo google_sub truoc (on dinh nhat), roi theo email.
// Tra ve row { id, email, display_name, email_verified_at } hoac null.
async function findGoogleCustomer(env, sub, email) {
  if (sub) {
    try {
      const bySub = await env.DB.prepare(
        "SELECT id, email, display_name, email_verified_at FROM customers WHERE google_sub = ?1"
      ).bind(sub).first();
      if (bySub) return bySub;
    } catch { /* DB chua co cot google_sub -> bo qua, tim theo email */ }
  }
  return env.DB.prepare(
    "SELECT id, email, display_name, email_verified_at FROM customers WHERE email = ?1"
  ).bind(email).first();
}

async function setGoogleSub(env, customerId, sub) {
  if (!sub) return;
  try {
    await env.DB.prepare("UPDATE customers SET google_sub = ?2 WHERE id = ?1 AND (google_sub IS NULL OR google_sub = ?2)")
      .bind(customerId, sub).run();
  } catch { /* cot chua co / sub da thuoc tai khoan khac -> bo qua */ }
}

// Cap license dung thu khuyen mai cho tai khoan MOI — cung luat voi
// register.js (idempotent theo marker 'promo:<id>' trong notes).
// Loi o buoc nay khong duoc lam hong dang nhap.
async function grantTrialLikeRegister(env, request, customerId) {
  try {
    const benefit = resolveTrialBenefit(await getPromotions(env), Date.now());
    if (!benefit) return null;
    const marker = `promo:${benefit.promo.id}`;
    const dup = await env.DB.prepare(
      "SELECT id FROM licenses WHERE customer_id = ?1 AND organization = 'promo' AND notes LIKE ?2 LIMIT 1"
    ).bind(customerId, marker + "%").first();
    if (dup) return null;
    const nowIso = new Date().toISOString();
    const { expiry, activatedAt } = trialWindow(benefit.promo);
    const trialId = newLicenseId();
    await env.DB.prepare(
      `INSERT INTO licenses
         (id, license_key, customer_id, app, product_id, tier, status, organization,
          expiry_utc, validity_days, activated_at, revoked_at, source, order_id, created_at, notes)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active', 'promo', ?7, ?8, ?9, NULL, 'manual', NULL, ?10, ?11)`
    ).bind(
      trialId, newLicenseKey("HORA"), customerId, appForPlan(benefit.tier), appForPlan(benefit.tier),
      benefit.tier, expiry, benefit.days, activatedAt, nowIso,
      `${marker}; Khuyen mai "${benefit.promo.name}": dung thu ${benefit.days} ngay khi dang ky`
    ).run();
    await logEvent(env, { eventType: "promo.trial_granted", customerId, ip: clientIp(request) });
    return { tier: benefit.tier, days: benefit.days };
  } catch (err) {
    console.warn("google: grant trial failed:", err && err.message ? err.message : String(err));
    return null;
  }
}

// Tim hoac tao khach tu profile Google DA XAC MINH (caller da kiem tra
// id_token + email_verified). Tai khoan tao moi:
//   - email_verified_at = ngay bay gio (Google da xac thuc email).
//   - password_hash la bam cua mot chuoi ngau nhien khong ai biet —
//     khach chua co mat khau web; dat mat khau sau bang "Quen mat khau".
//   - duoc cap dung thu khuyen mai nhu dang ky thuong.
// Tai khoan da co (khop email/sub): danh dau da xac thuc email (neu chua)
// + gan google_sub (neu cot co) + bo sung ten hien thi neu dang trong.
export async function findOrCreateGoogleCustomer(env, request, profile) {
  const email = String(profile.email || "").trim().toLowerCase();
  const sub = String(profile.sub || "");
  const name = String(profile.name || "").trim().slice(0, 80) || null;
  const nowIso = new Date().toISOString();

  const existing = await findGoogleCustomer(env, sub, email);
  if (existing) {
    if (!existing.email_verified_at) {
      await env.DB.prepare("UPDATE customers SET email_verified_at = ?2 WHERE id = ?1")
        .bind(existing.id, nowIso).run();
    }
    if (!existing.display_name && name) {
      await env.DB.prepare("UPDATE customers SET display_name = ?2 WHERE id = ?1")
        .bind(existing.id, name).run();
    }
    await setGoogleSub(env, existing.id, sub);
    await logEvent(env, { eventType: "auth.google_login", customerId: existing.id, ip: clientIp(request) });
    return { customer: { id: existing.id, email: existing.email, displayName: name || existing.display_name }, created: false };
  }

  const id = crypto.randomUUID();
  const unknownPassword = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  const { hash, salt, iterations } = await hashPassword(unknownPassword);
  let inserted = false;
  try {
    await env.DB.prepare(
      "INSERT INTO customers (id, email, password_hash, salt, iterations, display_name, email_verified_at, google_sub, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"
    ).bind(id, email, hash, salt, iterations, name, nowIso, sub || null, nowIso).run();
    inserted = true;
  } catch {
    inserted = false; // DB chua co cot google_sub -> thu lai khong co cot do
  }
  if (!inserted) {
    await env.DB.prepare(
      "INSERT INTO customers (id, email, password_hash, salt, iterations, display_name, email_verified_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
    ).bind(id, email, hash, salt, iterations, name, nowIso, nowIso).run();
  }

  await logEvent(env, { eventType: "auth.google_register", customerId: id, ip: clientIp(request) });
  await grantTrialLikeRegister(env, request, id);
  return { customer: { id, email, displayName: name }, created: true };
}
