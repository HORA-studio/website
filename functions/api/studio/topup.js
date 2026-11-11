// /api/studio/topup — phien nap credit Studio qua chuyen khoan (SePay).
// POST { pack: "topup-200" } — tao (hoac tai dung trong 24h) 1 phien nap
//   'pending' kem MA RIENG (STUxxxxxxxx) de khach ghi vao noi dung chuyen
//   khoan; tra kem huong dan thanh toan (QR VietQR + ngan hang + so tai
//   khoan) dung tu cau hinh SePay cua website (buildSepayInstructions).
//   Khi tien vao, webhook SePay (functions/api/payments/sepay-webhook.js)
//   khop MA + SO TIEN -> tu cong credit (nhanh Studio trong webhook do).
// GET ?code=STU... — trang thai phien nap cua CHINH khach (UI tu hoi moi
//   vai giay khi modal QR dang mo; 'paid' la UI tu cap nhat so du).
import { json, errorJson, readJson, requireAuth } from "../_lib.js";
import { CREDIT_PACKS, getBalance, newStudioId } from "./_studio.js";
import { buildSepayInstructions, isSepayConfigured } from "../payments/_gateway.js";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // bo ky tu de nham (I,L,O,0,1)
function newTopupCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let code = "STU";
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return code;
}

function topupOut(r, env) {
  return {
    id: r.id,
    pack: r.pack,
    amount: r.amount_vnd,
    credits: r.credits,
    code: r.code,
    status: r.status,
    createdAt: r.created_at,
    paidAt: r.paid_at || null,
    instructions: isSepayConfigured(env)
      ? buildSepayInstructions(env, { code: r.code, amount: r.amount_vnd })
      : null,
  };
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.response) return a.response;

  const body = await readJson(request);
  if (!body) return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);
  const pack = CREDIT_PACKS[String(body.pack || "")];
  if (!pack) return errorJson("INVALID_PACK", "Gói nạp không hợp lệ.", 422);

  // Tai dung phien pending cua chinh khach + cung goi trong 24h (tranh rac
  // khi khach bam nap nhieu lan — ma chuyen khoan giu nguyen de doi soat).
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const existing = await env.DB.prepare(
    "SELECT * FROM studio_topups WHERE customer_id = ?1 AND pack = ?2 AND status = 'pending' AND created_at > ?3 ORDER BY created_at DESC LIMIT 1"
  ).bind(a.customer.id, String(body.pack), since).first();
  if (existing) return json({ topup: topupOut(existing, env) });

  const now = new Date().toISOString();
  const row = {
    id: newStudioId("top"),
    customer_id: a.customer.id,
    pack: String(body.pack),
    amount_vnd: pack.amountVnd,
    credits: pack.credits,
    code: newTopupCode(),
    status: "pending",
    created_at: now,
    paid_at: null,
  };
  await env.DB.prepare(
    `INSERT INTO studio_topups (id, customer_id, pack, amount_vnd, credits, code, status, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7)`
  ).bind(row.id, row.customer_id, row.pack, row.amount_vnd, row.credits, row.code, now).run();
  return json({ topup: topupOut(row, env) }, 201);
}

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.response) return a.response;

  const code = new URL(request.url).searchParams.get("code");
  if (!code) {
    // Danh sach phien nap gan day cua chinh khach — UI dung de bao
    // "nap thanh cong" cho cac phien da paid ma khach chua thay thong bao.
    const { results } = await env.DB.prepare(
      "SELECT * FROM studio_topups WHERE customer_id = ?1 ORDER BY created_at DESC LIMIT 10"
    ).bind(a.customer.id).all();
    return json({
      topups: (results || []).map((r) => ({
        id: r.id, code: r.code, pack: r.pack, credits: r.credits,
        amount: r.amount_vnd, status: r.status,
        paidAt: r.paid_at || null, createdAt: r.created_at,
      })),
    });
  }
  const row = await env.DB.prepare(
    "SELECT * FROM studio_topups WHERE code = ?1 AND customer_id = ?2"
  ).bind(String(code).toUpperCase(), a.customer.id).first();
  if (!row) return errorJson("NOT_FOUND", "Không tìm thấy phiên nạp này.", 404);
  const balance = await getBalance(env, a.customer.id);
  return json({ topup: { id: row.id, code: row.code, status: row.status, credits: row.credits, amount: row.amount_vnd, paidAt: row.paid_at || null }, balance });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ GET, POST.", 405);
}
