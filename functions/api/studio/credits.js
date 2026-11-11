// GET /api/studio/credits — so du + so cai credit cua CHINH khach dang dang nhap.
// Tra { balance, ledger: [...] } moi nhat truoc, toi da 100 dong.
import { json, errorJson, requireAuth } from "../_lib.js";
import { getBalance } from "./_studio.js";

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.response) return a.response;

  const balance = await getBalance(env, a.customer.id);
  const { results } = await env.DB.prepare(
    "SELECT amount, reason, ref_id, label, balance_after, created_at FROM studio_credit_ledger WHERE customer_id = ?1 ORDER BY created_at DESC LIMIT 100"
  ).bind(a.customer.id).all();

  return json({
    balance,
    ledger: (results || []).map((r) => ({
      amount: r.amount,
      reason: r.reason,
      refId: r.ref_id,
      label: r.label,
      balanceAfter: r.balance_after,
      createdAt: r.created_at,
    })),
  });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ GET.", 405);
}
