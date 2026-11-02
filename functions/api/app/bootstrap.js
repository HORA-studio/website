// POST /api/app/bootstrap { userId, app, deviceId, licenseId? } — VB worker goi
// (server-to-server) de: (1) bind device vao license cua user, (2) tra plan/expiry.
// Xac thuc bang X-Identity-Secret.
//
// Quy tac:
// - licenseId (tuy chon): bind DUNG license do (khach chon o man chon license).
//   Khong co -> lay license con hieu luc MOI NHAT (auto khi chi co 1 license).
// - 1 license = 1 may: neu device da bind license KHAC -> neu cung tai khoan thi
//   rebind (chuyen sang license moi), khac tai khoan thi device_bound.
// - Chua co license -> needsActivation:true.
// - Lan bind dau tien -> bat dau dem han (expiry_utc = activated_at + validity_days).
// - License het han/thu hoi -> needsActivation:true + reason tuong ung.
import { json, errorJson, readJson } from "../_lib.js";
import { logEvent, clientIp } from "../_log.js";
import { acquireAccountSession, hashIp, sessionEnforced } from "../_session.js";

function secretOk(request, env) {
  const expected = env.IDENTITY_INTERNAL_SECRET;
  if (!expected) return false;
  const got = (request.headers.get("X-Identity-Secret") || "").trim();
  if (!got || got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// Tran job dong thoi mac dinh khi bang plans CHUA seed tier do. Khong phai
// nguon su that: worker app tra jobPolicy tu plans, con man chon license chi
// hien thi con so nay. Seed 1 lan bang db/seed-plans-2026-11-02.sql de khop.
const MAX_CONCURRENT_FALLBACK = { go: 10, plus: 30, pro: 50 };

// Doc plans(app, tier) -> videoConcurrency (giong maxVideoJobs trong worker app:
// thieu videoConcurrency thi lay imageConcurrency/concurrency; khong co gi -> 0).
// Doc 1 lan cho ca request (khong ton them request/round-trip nao).
async function maxConcurrentFor(env, app, tier) {
  try {
    const row = await env.DB.prepare(
      "SELECT quota_json FROM plans WHERE app = ?1 AND tier = ?2 LIMIT 1"
    ).bind(app, tier).first();
    const q = row ? JSON.parse(row.quota_json) : null;
    const n = q && [q.videoConcurrency, q.imageConcurrency, q.concurrency]
      .find((v) => Number.isFinite(Number(v)) && Number(v) > 0);
    if (n !== undefined) return Math.round(Number(n));
  } catch {
    // Bang plans thieu/JSON loi -> fail-soft ve mac dinh trong code.
  }
  return MAX_CONCURRENT_FALLBACK[tier] || 2;
}

const noLicense = (reason) => json({
  licenseValid: false, plan: "no-license", expiry: null,
  maxConcurrentVideoJobs: 0, needsActivation: true, reason,
}, 200);

export async function onRequestPost({ request, env }) {
  if (!secretOk(request, env)) return errorJson("UNAUTHORIZED", "Sai hoặc thiếu X-Identity-Secret.", 401);

  const body = await readJson(request);
  if (!body) return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);

  const userId = String(body.userId || body.user_id || "").trim();
  const app = String(body.app || "video-builder").trim();
  const deviceId = String(body.deviceId || body.device_id || "").trim().slice(0, 128);
  const licenseId = String(body.licenseId || body.license_id || "").trim();
  if (!userId) return errorJson("INVALID_USER", "Thiếu userId.", 422);
  if (!deviceId) return errorJson("INVALID_DEVICE", "Thiếu deviceId.", 422);

  try {
    // Phien doc quyen theo tai khoan: chot thu HAI (sau device/poll). Neu phien
    // da bi may khac giu giua luc poll va bootstrap thi khong cho vao app —
    // tra needsActivation + reason "session_taken" de app hien man dang nhap.
    // Cong tac session.enforce mac dinh TAT.
    if (await sessionEnforced(env)) {
      const acquired = await acquireAccountSession(
        env, userId, app, deviceId, await hashIp(clientIp(request))
      );
      if (!acquired.acquired) {
        await logEvent(env, {
          eventType: "app.session_blocked", customerId: userId, actor: "app",
          ip: clientIp(request), deviceId, details: { app },
        });
        return json({
          licenseValid: false, plan: "no-license", expiry: null,
          maxConcurrentVideoJobs: 0, needsActivation: true, reason: "session_taken",
        }, 200);
      }
    }

    // Lay license: uu tien licenseId khach chon; khong thi license moi nhat.
    const lic = licenseId
      ? await env.DB.prepare(
          "SELECT * FROM licenses WHERE id = ?1 AND customer_id = ?2 AND app = ?3 LIMIT 1"
        ).bind(licenseId, userId, app).first()
      : await env.DB.prepare(
          "SELECT * FROM licenses WHERE customer_id = ?1 AND app = ?2 ORDER BY created_at DESC LIMIT 1"
        ).bind(userId, app).first();

    if (!lic) return noLicense(licenseId ? "license_not_found" : "no_license");
    if (lic.revoked_at) return noLicense("revoked");

    const now = new Date();
    if (lic.expiry_utc && new Date(lic.expiry_utc).getTime() <= now.getTime()) return noLicense("expired");

    // Device binding: 1 license = 1 may (PK devices(app, device_id)).
    const bound = await env.DB.prepare(
      "SELECT license_id FROM devices WHERE app = ?1 AND device_id = ?2 LIMIT 1"
    ).bind(app, deviceId).first();

    if (!bound) {
      await env.DB.prepare(
        "INSERT INTO devices (app, device_id, license_id, customer_id, bound_at) VALUES (?1, ?2, ?3, ?4, ?5)"
      ).bind(app, deviceId, lic.id, userId, now.toISOString()).run();
      await logEvent(env, { eventType: "app.device_bind", customerId: userId, actor: "app", ip: clientIp(request), deviceId, details: { app, licenseId: lic.id } });
    } else if (bound.license_id !== lic.id) {
      // Device da bind license khac. Cho rebind neu license cu cung tai khoan
      // (hoac la rac: khong gan khach nao) -> tranh 502 UNIQUE constraint.
      const prev = await env.DB.prepare(
        "SELECT customer_id FROM licenses WHERE id = ?1"
      ).bind(bound.license_id).first();
      const sameOwner = prev && prev.customer_id && prev.customer_id === userId;
      const orphan = !prev || !prev.customer_id;
      if (!(sameOwner || orphan)) return noLicense("device_bound");

      await env.DB.prepare(
        "UPDATE devices SET license_id = ?3, customer_id = ?4, bound_at = ?5 WHERE app = ?1 AND device_id = ?2"
      ).bind(app, deviceId, lic.id, userId, now.toISOString()).run();
      await logEvent(env, { eventType: "app.device_rebind", customerId: userId, actor: "app", ip: clientIp(request), deviceId, details: { app, fromLicense: bound.license_id, toLicense: lic.id } });
    }

    // Lan kich hoat dau tien -> dem han tu bay gio.
    let expiry = lic.expiry_utc;
    if (!expiry) {
      const days = Number(lic.validity_days) || 30;
      expiry = new Date(now.getTime() + days * 86400000).toISOString();
      await env.DB.prepare(
        "UPDATE licenses SET expiry_utc = ?2, activated_at = ?2 WHERE id = ?1 AND expiry_utc IS NULL"
      ).bind(lic.id, expiry).run();
    }

    const tier = lic.tier || "go";
    return json({
      licenseValid: true,
      plan: tier,
      expiry,
      maxConcurrentVideoJobs: await maxConcurrentFor(env, app, tier),
      needsActivation: false,
      reason: null,
    }, 200);
  } catch (err) {
    // Loi DB khac (vd bat ngo) -> tra loi ro rang thay vi crash mo ho.
    console.warn("app/bootstrap failed:", err && err.message ? err.message : String(err));
    return errorJson("BOOTSTRAP_FAILED", "Không xử lý được license.", 500);
  }
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}
