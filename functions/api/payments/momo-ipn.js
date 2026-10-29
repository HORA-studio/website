// POST /api/payments/momo-ipn — MoMo goi URL nay de bao ket qua thanh toan.
// Quy tac cung: XAC MINH CHU KY + DOI CHIEU SO TIEN voi don da luu moi ghi 'paid'.
// Thanh cong -> tra HTTP 204 (theo tai lieu MoMo). Trang return KHONG ghi paid.
import { readJson, tryIssueLicense } from "../_lib.js";
import { isMomoConfigured, verifyMomoIpnSignature } from "./_gateway.js";

function fail(status, message) {
  return new Response(JSON.stringify({ resultCode: 1, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return fail(400, "Invalid JSON");
  if (!isMomoConfigured(env)) return fail(503, "Gateway not configured");

  const okSig = await verifyMomoIpnSignature(env, body);
  if (!okSig) return fail(400, "Invalid signature");

  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?1").bind(String(body.orderId || "")).first();
  if (!order) return fail(404, "Order not found");

  if (Number(body.amount) !== Number(order.amount_vnd)) return fail(400, "Amount mismatch");

  const now = new Date().toISOString();
  const payRow = await env.DB.prepare(
    "SELECT id FROM payments WHERE order_id = ?1 AND gateway = 'momo' ORDER BY created_at DESC"
  ).bind(order.id).first();

  if (Number(body.resultCode) !== 0) {
    // Thanh toan that bai/huy: ghi nhan, khong danh dau paid.
    if (payRow) {
      await env.DB.prepare("UPDATE payments SET status = 'failed', gateway_trans_id = ?2, raw_json = ?3 WHERE id = ?1")
        .bind(payRow.id, String(body.transId || ""), JSON.stringify(body)).run();
    }
    if (order.status !== "paid") {
      await env.DB.prepare("UPDATE orders SET status = 'payment_failed' WHERE id = ?1").bind(order.id).run();
    }
    return new Response(null, { status: 204 });
  }

  if (payRow) {
    await env.DB.prepare("UPDATE payments SET status = 'paid', gateway_trans_id = ?2, raw_json = ?3 WHERE id = ?1")
      .bind(payRow.id, String(body.transId || ""), JSON.stringify(body)).run();
  } else {
    await env.DB.prepare(
      "INSERT INTO payments (id, order_id, gateway, gateway_order_id, gateway_trans_id, amount_vnd, status, raw_json, created_at) VALUES (?1, ?2, 'momo', ?3, ?4, ?5, 'paid', ?6, ?7)"
    ).bind(crypto.randomUUID(), order.id, String(body.orderId), String(body.transId || ""), order.amount_vnd, JSON.stringify(body), now).run();
  }
  await env.DB.prepare("UPDATE orders SET status = 'paid', paid_at = ?2 WHERE id = ?1").bind(order.id, now).run();

  // Cap license (neu endpoint noi bo da cau hinh); that bai -> paid_pending_issue.
  const cust = await env.DB.prepare("SELECT email FROM customers WHERE id = ?1").bind(order.customer_id).first();
  await tryIssueLicense(env, { ...order, email: cust ? cust.email : null });

  return new Response(null, { status: 204 });
}

export function onRequest() {
  return fail(405, "Method not allowed");
}
