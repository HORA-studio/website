// POST /api/internal/retry-issue — endpoint NOI BO (server-to-server / admin
// chay tay bang curl), xac thuc bang header X-Identity-Secret (dung lai
// IDENTITY_INTERNAL_SECRET nhu identity/verify). KHONG danh cho khach.
//
// Hai che do:
// - Body { orderId }: cap lai license cho 1 don da tra tien nhung chua co
//   license (don 'paid' thieu license hoac 'paid_pending_issue').
//   Tra { ok:true, alreadyIssued, licenseId }; don khong co -> 404, don
//   chua thanh toan -> 409, cap loi -> 500 ISSUE_FAILED (giua paid_pending_issue).
// - Khong body / khong orderId: QUET cac don dang ket (status 'paid' hoac
//   'paid_pending_issue' ma chua co license theo order_id), toi da
//   SWEEP_LIMIT don moi lan goi (don cu nhat truoc). Tra tong ket
//   { processed, issued, stillPending }.
//
// tryIssueLicense da idempotent theo order_id (L1) nen goi lai bao nhieu
// lan cung khong cap trung.
import { json, errorJson, readJson, tryIssueLicense } from "../_lib.js";
import { logEvent, clientIp } from "../_log.js";

const SWEEP_LIMIT = 20;

function secretOk(request, env) {
  const expected = env.IDENTITY_INTERNAL_SECRET;
  if (!expected) return false;
  const got = (request.headers.get("X-Identity-Secret") || "").trim();
  if (!got || got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function findLicenseId(env, orderId) {
  const row = await env.DB.prepare(
    "SELECT id FROM licenses WHERE order_id = ?1 LIMIT 1"
  ).bind(orderId).first();
  return row ? row.id : null;
}

// Cap lai cho 1 don. Tra { ok:true, licenseId } hoac nem loi (caller xu ly).
async function issueForOrder(env, order) {
  await tryIssueLicense(env, order);
  const after = await env.DB.prepare("SELECT license_id FROM orders WHERE id = ?1").bind(order.id).first();
  return after ? after.license_id : null;
}

export async function onRequestPost({ request, env }) {
  if (!secretOk(request, env)) return errorJson("UNAUTHORIZED", "Sai hoặc thiếu X-Identity-Secret.", 401);

  const body = await readJson(request);
  const orderId = String((body && body.orderId) || "").trim();

  // ---- Che do 1 don ----
  if (orderId) {
    const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?1").bind(orderId).first();
    if (!order) return errorJson("ORDER_NOT_FOUND", "Không tìm thấy đơn.", 404);
    if (order.status !== "paid" && order.status !== "paid_pending_issue") {
      return errorJson("ORDER_NOT_PAID", "Đơn chưa ở trạng thái đã thanh toán.", 409);
    }

    const existingId = await findLicenseId(env, orderId);
    if (existingId) {
      await env.DB.prepare("UPDATE orders SET status = 'paid', license_id = ?2 WHERE id = ?1")
        .bind(orderId, existingId).run();
      return json({ ok: true, alreadyIssued: true, licenseId: existingId });
    }

    try {
      const licenseId = await issueForOrder(env, order);
      return json({ ok: true, alreadyIssued: false, licenseId });
    } catch (e) {
      await env.DB.prepare("UPDATE orders SET status = 'paid_pending_issue' WHERE id = ?1").bind(orderId).run();
      await logEvent(env, { eventType: "license.issue_failed", customerId: order.customer_id, actor: "internal-retry", ip: clientIp(request), details: { orderId, error: String((e && e.message) || e) } });
      return errorJson("ISSUE_FAILED", "Cấp license thất bại, đơn giữ ở paid_pending_issue.", 500);
    }
  }

  // ---- Che do quet (khong orderId) ----
  const totalRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM orders o
      WHERE o.status IN ('paid', 'paid_pending_issue')
        AND NOT EXISTS (SELECT 1 FROM licenses l WHERE l.order_id = o.id)`
  ).first();
  const total = totalRow ? Number(totalRow.n) : 0;

  const { results } = await env.DB.prepare(
    `SELECT o.* FROM orders o
      WHERE o.status IN ('paid', 'paid_pending_issue')
        AND NOT EXISTS (SELECT 1 FROM licenses l WHERE l.order_id = o.id)
      ORDER BY o.paid_at ASC
      LIMIT ?1`
  ).bind(SWEEP_LIMIT).all();
  const batch = results || [];

  let issued = 0;
  for (const order of batch) {
    try {
      await issueForOrder(env, order);
      issued++;
    } catch (e) {
      await env.DB.prepare("UPDATE orders SET status = 'paid_pending_issue' WHERE id = ?1").bind(order.id).run();
      await logEvent(env, { eventType: "license.issue_failed", customerId: order.customer_id, actor: "internal-retry", ip: clientIp(request), details: { orderId: order.id, error: String((e && e.message) || e) } });
    }
  }

  return json({ processed: batch.length, issued, stillPending: total - issued });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}
