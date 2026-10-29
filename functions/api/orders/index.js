// /api/orders — POST: tao don mua license; GET: lich su giao dich cua khach.
// Gia dang null (chua chot) -> 422 PRICE_NOT_SET. Cong thanh toan chua cau hinh
// merchant -> don van duoc tao (status 'created') + 503 GATEWAY_NOT_CONFIGURED,
// TUYET DOI khong tra URL thanh toan gia.
import { json, errorJson, readJson, requireAuth, getPlans, newOrderId } from "../_lib.js";
import { isGatewayConfigured, createGatewayPayment, sepayPaymentCode, buildSepayInstructions } from "../payments/_gateway.js";

function orderOut(r) {
  return {
    id: r.id,
    plan: r.plan,
    period: r.period,
    amountVnd: r.amount_vnd,
    status: r.status,
    gateway: r.gateway,
    licenseId: r.license_id,
    createdAt: r.created_at,
    paidAt: r.paid_at,
  };
}

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.response) return a.response;
  const { results } = await env.DB.prepare(
    "SELECT * FROM orders WHERE customer_id = ?1 ORDER BY created_at DESC"
  ).bind(a.customer.id).all();
  return json({ orders: (results || []).map(orderOut) });
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.response) return a.response;

  const body = await readJson(request);
  if (!body) return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);

  const plan = String(body.plan || "");
  const period = String(body.period || "");
  const gateway = String(body.gateway || "");
  const plans = getPlans(env);

  if (!plans[plan]) return errorJson("INVALID_PLAN", "Gói không hợp lệ (chỉ có 'go' và 'plus').", 422);
  if (period !== "month" && period !== "year") return errorJson("INVALID_PERIOD", "Thời hạn phải là 'month' hoặc 'year'.", 422);
  if (gateway !== "sepay" && gateway !== "momo" && gateway !== "vnpay") return errorJson("INVALID_GATEWAY", "Cổng thanh toán phải là 'sepay', 'momo' hoặc 'vnpay'.", 422);

  const amount = plans[plan][period];
  if (amount === null || amount === undefined) {
    return errorJson("PRICE_NOT_SET", "Giá gói này chưa được công bố — chưa mở bán.", 422);
  }

  const order = {
    id: newOrderId(),
    customer_id: a.customer.id,
    plan,
    period,
    amount_vnd: amount,
    gateway,
  };
  await env.DB.prepare(
    "INSERT INTO orders (id, customer_id, plan, period, amount_vnd, status, gateway, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 'created', ?6, ?7)"
  ).bind(order.id, order.customer_id, plan, period, amount, gateway, new Date().toISOString()).run();

  if (!isGatewayConfigured(env, gateway)) {
    return json(
      {
        error: { code: "GATEWAY_NOT_CONFIGURED", message: "Cổng thanh toán chưa được cấu hình merchant. Đơn đã được tạo ở trạng thái 'created', chưa thể thanh toán." },
        order: orderOut({ ...order, amount_vnd: amount, status: "created", license_id: null, created_at: new Date().toISOString(), paid_at: null }),
      },
      503
    );
  }

  // SePay: khong co URL thanh toan — don cho o trang thai 'awaiting_payment',
  // tra ve HUONG DAN CHUYEN KHOAN (ngan hang, so tai khoan, so tien, ma noi
  // dung + QR VietQR). Webhook SePay se ghi 'paid' khi tien ve dung ma/so tien.
  if (gateway === "sepay") {
    const code = sepayPaymentCode(order.id);
    await env.DB.prepare(
      "INSERT INTO payments (id, order_id, gateway, gateway_order_id, amount_vnd, status, created_at) VALUES (?1, ?2, 'sepay', ?3, ?4, 'initiated', ?5)"
    ).bind(crypto.randomUUID(), order.id, code, amount, new Date().toISOString()).run();
    await env.DB.prepare("UPDATE orders SET status = 'awaiting_payment' WHERE id = ?1").bind(order.id).run();
    return json(
      {
        order: { id: order.id, status: "awaiting_payment" },
        payment_instructions: buildSepayInstructions(env, { code, amount }),
      },
      201
    );
  }

  const origin = new URL(request.url).origin;
  const ipAddr = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
  try {
    const pay = await createGatewayPayment(env, gateway, { order, origin, ipAddr });
    await env.DB.prepare("UPDATE orders SET status = 'awaiting_payment' WHERE id = ?1").bind(order.id).run();
    await env.DB.prepare(
      "INSERT INTO payments (id, order_id, gateway, gateway_order_id, amount_vnd, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 'initiated', ?6)"
    ).bind(crypto.randomUUID(), order.id, gateway, pay.gatewayOrderId || order.id, amount, new Date().toISOString()).run();
    return json({ order: { id: order.id, status: "awaiting_payment" }, paymentUrl: pay.paymentUrl }, 201);
  } catch (err) {
    return json(
      {
        error: { code: err.code || "GATEWAY_ERROR", message: String(err.message || err) },
        order: { id: order.id, status: "created" },
      },
      502
    );
  }
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ GET/POST.", 405);
}
