// POST /api/identity/device/poll { device_code } — app poll cho toi khi user dong y.
// Tra ve:
//   200 { status: "pending" }                       — chua duyet
//   200 { status: "slow_down", interval }           — poll nhanh hon interval
//   200 { status: "approved", userId, token, ... }  — da duyet, token phat 1 lan
//   403 DEVICE_DENIED        — user tu choi (app nen dung)
//   409 DEVICE_ALREADY_USED  — token da phat (app da lay roi)
//   410 DEVICE_EXPIRED       — het han
//   404 DEVICE_NOT_FOUND     — ma sai
import { json, errorJson, readJson, sha256Hex } from "../../_lib.js";
import { logEvent, clientIp } from "../../_log.js";
import { expireIfStale, randomHex32 } from "../_device.js";
import { acquireAccountSession, hashIp, sessionEnforced } from "../../_session.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);

  const deviceCode = String(body.device_code || body.deviceCode || "").trim();
  if (!deviceCode) return errorJson("INVALID_CODE", "Thiếu device_code.", 422);

  const deviceCodeHash = await sha256Hex(deviceCode);
  let row = await env.DB.prepare(
    "SELECT * FROM device_auth WHERE device_code_hash = ?1"
  ).bind(deviceCodeHash).first();
  if (!row) return errorJson("DEVICE_NOT_FOUND", "Phiên kết nối không tồn tại.", 404);

  row = await expireIfStale(env, row);

  if (row.status === "expired") return errorJson("DEVICE_EXPIRED", "Phiên kết nối đã hết hạn.", 410);
  if (row.status === "denied") {
    return errorJson("DEVICE_DENIED", "Bạn đã từ chối kết nối trên web.", 403);
  }

  if (row.status === "pending") {
    // slow_down: poll nhanh hon interval cho phep.
    const nowMs = Date.now();
    const last = row.last_polled_at ? new Date(row.last_polled_at).getTime() : 0;
    const interval = Number(row.interval_seconds) || 5;
    await env.DB.prepare("UPDATE device_auth SET last_polled_at = ?2 WHERE device_code_hash = ?1")
      .bind(deviceCodeHash, new Date(nowMs).toISOString()).run();
    if (last && nowMs - last < interval * 1000) {
      return json({ status: "slow_down", interval: interval + 5 });
    }
    return json({ status: "pending" });
  }

  // status === "approved"
  if (row.token_issued_at) {
    return errorJson("DEVICE_ALREADY_USED", "Phiên kết nối này đã được sử dụng.", 409);
  }

  // Phien doc quyen theo tai khoan: neu tai khoan dang duoc may khac giu phien
  // thi CHAN ngay tai day (khong cap token). May vao sau bam "Dong y" roi van
  // khong nhan duoc token -> app hien man "dang dung o may khac".
  // Cong tac session.enforce: mac dinh TAT -> chua chan gi (an toan khi deploy
  // truoc luc app moi phat hanh).
  const deviceId = row.device_id || "";
  if (await sessionEnforced(env)) {
    const acquired = await acquireAccountSession(
      env, row.customer_id, row.app, deviceId, await hashIp(clientIp(request))
    );
    if (!acquired.acquired) {
      await logEvent(env, {
        eventType: "identity.session_blocked", customerId: row.customer_id, actor: "web",
        ip: clientIp(request), deviceId: deviceId || null, details: { app: row.app },
      });
      if (acquired.retryAfterSeconds && acquired.retryAfterSeconds > 0) {
        return json({ error: {
          code: "SESSION_RETRY_TOO_SOON",
          message: `Tài khoản đang được dùng ở máy khác. Thử lại sau ${acquired.retryAfterSeconds}s.`,
        } }, 429, { "Retry-After": String(acquired.retryAfterSeconds) });
      }
      return errorJson("SESSION_TAKEN",
        "Tài khoản này đang được đăng nhập ở máy khác. Hãy bấm Đăng xuất ở máy đó rồi thử lại.", 503);
    }
  }

  const nowIso = new Date().toISOString();
  const token = randomHex32();
  const tokenHash = await sha256Hex(token);

  // Chi phat 1 lan: danh dau truoc, atomic.
  const upd = await env.DB.prepare(
    "UPDATE device_auth SET token_issued_at = ?2 WHERE device_code_hash = ?1 AND token_issued_at IS NULL"
  ).bind(deviceCodeHash, nowIso).run();
  if ((upd.meta && upd.meta.changes) === 0) {
    return errorJson("DEVICE_ALREADY_USED", "Phiên kết nối này đã được sử dụng.", 409);
  }

  await env.DB.prepare(
    "INSERT INTO app_tokens (token_hash, customer_id, app, device_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5)"
  ).bind(tokenHash, row.customer_id, row.app, row.device_id || null, nowIso).run();

  await logEvent(env, {
    eventType: "identity.device_token", customerId: row.customer_id, actor: "app",
    ip: clientIp(request), deviceId: row.device_id || null, details: { app: row.app },
  });

  return json({
    status: "approved",
    userId: row.customer_id,
    token,
    app: row.app,
    deviceId: row.device_id || null,
  });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}
