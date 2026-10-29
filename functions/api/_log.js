// Ghi nhat ky hanh vi vao D1 "hora-website-events" (binding DB_EVENTS).
// NGUYEN TAC: fail-open — moi loi (thieu binding, DB loi...) deu bi nuot
// va chi console.warn; KHONG bao gio lam vo request nghiep vu.
// KHONG bao gio ghi mat khau / token tho / license key tho vao log.

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Ghi 1 event. Tra ve true/false nhung caller KHONG nen phu thuoc ket qua.
 * @param {object} env  - Pages env (can binding DB_EVENTS)
 * @param {object} e    - { eventType, customerId?, actor?, details?, ip?, deviceId?, meta? }
 */
export async function logEvent(env, e) {
  try {
    if (!env || !env.DB_EVENTS) return false;
    const now = new Date();
    const day = todayUtc();
    const details = e.details === undefined || e.details === null
      ? null
      : (typeof e.details === "string" ? e.details : JSON.stringify(e.details));
    const meta = e.meta === undefined || e.meta === null
      ? null
      : (typeof e.meta === "string" ? e.meta : JSON.stringify(e.meta));

    await env.DB_EVENTS.prepare(
      `INSERT INTO events (event_type, customer_id, actor, details, ip, device_id, created_at, day, meta)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
    ).bind(
      String(e.eventType || "unknown"),
      e.customerId || null,
      e.actor || "web",
      details,
      e.ip || null,
      e.deviceId || null,
      now.toISOString(),
      day,
      meta
    ).run();

    // Cap nhat tong hop theo ngay (best-effort, cung trong 1 lan goi).
    await env.DB_EVENTS.prepare(
      `INSERT INTO event_daily (day, event_type, count) VALUES (?1, ?2, 1)
       ON CONFLICT(day, event_type) DO UPDATE SET count = count + 1`
    ).bind(day, String(e.eventType || "unknown")).run();

    return true;
  } catch (err) {
    console.warn("logEvent failed:", err && err.message ? err.message : String(err));
    return false;
  }
}

/** IP client (Pages Functions dung sau Cloudflare). */
export function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || null;
}
