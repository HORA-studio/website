// Helper dung chung cho phien dang nhap doc quyen theo tai khoan (bang
// `account_sessions`): 1 tai khoan + 1 app = 1 may tai mot thoi diem.
//
// Quy uoc:
// - May vao TRUOC giu phien (first-wins). May khac muon vao thi bi chan, KHONG
//   duoc cap token, phai doi may cu nha phien (nut Dang xuat) hoac het cooldown.
// - GIANH phien la 1 cau INSERT ... ON CONFLICT co dieu kien -> atomic, chong
//   dua khi 2 may cung luc.
// - Cooldown 60s: sau khi bi chan, may do phai cho moi thu lai (chong spam).
//
// Moi ham deu fail-open theo huong KHONG chan nguoi dung (loi DB -> coi nhu
// chua co phien), tru khi ro rang dang bi may khac giu.

import { sha256Hex } from "./_lib.js";

export const SESSION_COOLDOWN_SECONDS = 60;

/**
 * Cờ bật/tắt chặn phiên (bảng `meta`, key `session.enforce`). Mặc định TẮT khi
 * chưa có dòng nào: deploy code trước cũng an toàn (không chặn ai), bật cờ sau
 * khi app mới đã phát hành để tránh app cũ gặp lỗi SESSION_TAKEN không hiểu.
 * Vẫn có thể TẮT lại nhanh bằng cách set value = 'false' nếu có sự cố.
 */
export async function sessionEnforced(env) {
  try {
    const row = await env.DB.prepare("SELECT value FROM meta WHERE key = 'session.enforce'").first();
    return !!row && String(row.value).trim().toLowerCase() === "true";
  } catch {
    return false;
  }
}

// Hash IP de chan doan (12 hex dau) — khong luu IP tho.
export async function hashIp(ip) {
  if (!ip) return null;
  try {
    return (await sha256Hex(String(ip))).slice(0, 12);
  } catch {
    return null;
  }
}

// Doc dong phien hien tai cua (customer, app). Tra null neu chua co.
export async function getAccountSession(env, customerId, app) {
  try {
    return await env.DB.prepare(
      "SELECT * FROM account_sessions WHERE customer_id = ?1 AND app = ?2"
    ).bind(customerId, app).first();
  } catch {
    return null;
  }
}

// So giay con phai cho neu dang trong cooldown sau lan bi chan; 0 = khong bi chan.
export function cooldownRemainingSeconds(row, nowMs = Date.now()) {
  if (!row || !row.last_blocked_at) return 0;
  const elapsed = (nowMs - new Date(row.last_blocked_at).getTime()) / 1000;
  const remaining = SESSION_COOLDOWN_SECONDS - elapsed;
  return remaining > 0 ? Math.ceil(remaining) : 0;
}

/**
 * Gianh phien (customer, app) cho `deviceId`. Atomic: 1 cau UPSERT co dieu kien
 * — thanh cong chi khi phien dang trong (NULL) hoac dang thuoc chinh may nay.
 *
 * Tra ve:
 *   { acquired: true }                          — may nay giu phien
 *   { acquired: false, retryAfterSeconds: n }   — may khac dang giu; n>0 neu dang cooldown
 */
export async function acquireAccountSession(env, customerId, app, deviceId, ipHash) {
  const nowIso = new Date().toISOString();

  // Trong cooldown sau lan bi chan -> chua cho thu lai (khong cham DB ghi).
  const existing = await getAccountSession(env, customerId, app);
  const held = existing && existing.session_device_id;
  if (held && held !== deviceId) {
    const wait = cooldownRemainingSeconds(existing);
    if (wait > 0) return { acquired: false, retryAfterSeconds: wait };
    // Het cooldown: ghi nhan lan bi chan moi (de lan sau lai cho 60s).
    try {
      await env.DB.prepare(
        "UPDATE account_sessions SET last_blocked_at = ?3 WHERE customer_id = ?1 AND app = ?2"
      ).bind(customerId, app, nowIso).run();
    } catch {
      // khong ghi duoc moc chan -> van tra ve "bi chan" (an toan)
    }
    return { acquired: false, retryAfterSeconds: SESSION_COOLDOWN_SECONDS };
  }

  // Phien trong hoac dang thuoc may nay -> gianh (atomic theo dieu kien).
  try {
    const res = await env.DB.prepare(
      `INSERT INTO account_sessions
         (customer_id, app, session_device_id, session_started_at, session_ip_hash, last_blocked_at)
       VALUES (?1, ?2, ?3, ?4, ?5, NULL)
       ON CONFLICT(customer_id, app) DO UPDATE SET
         session_device_id  = excluded.session_device_id,
         session_started_at = excluded.session_started_at,
         session_ip_hash    = excluded.session_ip_hash,
         last_blocked_at    = NULL
       WHERE account_sessions.session_device_id IS NULL
          OR account_sessions.session_device_id = excluded.session_device_id`
    ).bind(customerId, app, deviceId, nowIso, ipHash ?? null).run();

    if ((res.meta && res.meta.changes) > 0) return { acquired: true };

    // Khong doi duoc row nao: giua luc doc va ghi, may khac da gianh -> bi chan.
    try {
      await env.DB.prepare(
        "UPDATE account_sessions SET last_blocked_at = ?3 WHERE customer_id = ?1 AND app = ?2"
      ).bind(customerId, app, nowIso).run();
    } catch { /* bo qua */ }
    return { acquired: false, retryAfterSeconds: SESSION_COOLDOWN_SECONDS };
  } catch {
    // Loi DB: fail-open theo huong cho vao (khong chan oan nguoi dung).
    return { acquired: true };
  }
}

/**
 * Nha phien neu dung `deviceId` dang giu (may la khong nha ho duoc). Tra true
 * neu co nha (hoac khong co gi de nha — coi nhu thanh cong).
 */
export async function releaseAccountSession(env, customerId, app, deviceId) {
  const nowIso = new Date().toISOString();
  try {
    await env.DB.prepare(
      `UPDATE account_sessions
          SET session_device_id = NULL, session_started_at = NULL, session_ip_hash = NULL,
              released_at = ?4, last_blocked_at = NULL
        WHERE customer_id = ?1 AND app = ?2
          AND (session_device_id IS NULL OR session_device_id = ?3)`
    ).bind(customerId, app, deviceId, nowIso).run();
    return true;
  } catch {
    return false;
  }
}

/**
 * Trang thai phien cho session/check: may nay con la may giu phien khong.
 * `actives=false` khi chua xac dinh duoc (thieu du lieu) -> app KHONG bi da.
 */
export async function accountSessionStatus(env, customerId, app, deviceId) {
  const inactive = { actives: false, isCurrentDevice: false, deviceCount: 0, sameDeviceCount: 0 };
  const row = await getAccountSession(env, customerId, app);
  if (!row || !row.session_device_id) {
    return { ...inactive, deviceCount: 0, sameDeviceCount: 0 };
  }
  const isCurrentDevice = row.session_device_id === deviceId;
  return {
    actives: true,
    isCurrentDevice,
    deviceCount: 1,
    sameDeviceCount: isCurrentDevice ? 1 : 0,
  };
}
