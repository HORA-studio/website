// GET /api/promo — thong tin khuyen mai cho frontend (trang chu + account).
// Cong khai khi chua dang nhap; neu co session thi kem trang thai ca nhan
// (you.eligible / you.hasTrial) de account hien thong bao dung nguoi.
import { json, errorJson, getSessionCustomer } from "./_lib.js";
import { getPromotion, publicPromotion, isCustomerEligible } from "./_promo.js";

export async function onRequestGet({ request, env }) {
  const cfg = await getPromotion(env);
  const nowMs = Date.now();
  const out = publicPromotion(cfg, nowMs);

  let customer = null;
  try {
    customer = await getSessionCustomer(env, request);
  } catch {
    customer = null;
  }
  if (customer) {
    const eligible = isCustomerEligible(cfg, customer.createdAt || customer.created_at, nowMs);
    let hasTrial = false;
    if (eligible) {
      try {
        const t = await env.DB.prepare(
          "SELECT id FROM licenses WHERE customer_id = ?1 AND organization = 'promo' LIMIT 1"
        )
          .bind(customer.id)
          .first();
        hasTrial = !!t;
      } catch {
        hasTrial = false;
      }
    }
    out.you = { eligible, hasTrial };
  }
  return json(out);
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ GET.", 405);
}
