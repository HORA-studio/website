// HORA Studio — cau hinh model/gia credit + helper vi credit dung chung.
// Mau flow lay theo ShrimpReel (MIT): tru credit TRUOC khi xep hang,
// HOAN 100% khi gen loi/timeout; so cai chi ghi them (append-only),
// so du = SUM(ledger) — khong sua/xoa dong cu.
//
// Luu tru ket qua: file that nam o R2 (binding STUDIO_MEDIA, cau hinh tren
// Cloudflare dashboard — xem docs/studio.md). DB chi giu metadata + result_key.
// Han luu: anh goc 7 ngay, ket qua gen 30 ngay (expires_at = created_at + 30d);
// viec don file het han do cron ngoai (Worker rieng) doc cot expires_at.

export const RETENTION_DAYS = 30;
export const SOURCE_RETENTION_DAYS = 7;

// Gia credit TAM (chot gia that truoc khi mo ban). Video tinh theo giay.
export const STUDIO_MODELS = {
  image: [
    { id: "hora-image-1", name: "HORA Image 1", cost: 5 },
    { id: "flux-pro", name: "FLUX Pro", cost: 12 },
    { id: "nano-pro", name: "Nano Pro Edit", cost: 18 },
  ],
  video: [
    { id: "kling-2-6", name: "Kling 2.6 Motion", costPerSecond: 6 },
    { id: "veo-fast", name: "Veo Fast", costPerSecond: 9 },
    { id: "hailuo-02", name: "Hailuo 02", costPerSecond: 4 },
  ],
};

// Goi credit le + goi thang (hien thi o studio.html #pricing; thanh toan di
// qua don hang/orders hien co — webhook thanh toan cong credit bang
// grantCredits(..., 'purchase', orderId), xem docs/studio.md).
export const CREDIT_PACKS = {
  trial: { name: "Gói Thử", credits: 100, amountVnd: 49000 },
  creator: { name: "Gói Sáng tạo", credits: 600, amountVnd: 199000 },
  pro: { name: "Gói Tháng Pro", credits: 2500, amountVnd: 499000 },
};

export function findModel(kind, modelId) {
  const list = STUDIO_MODELS[kind] || [];
  return list.find((m) => m.id === modelId) || null;
}

export function generationCost(kind, model, { duration } = {}) {
  if (!model) return null;
  if (kind === "video") {
    const d = duration === 10 ? 10 : 5;
    return model.costPerSecond * d;
  }
  return model.cost;
}

export function newStudioId(prefix = "gen") {
  const rand = [...crypto.getRandomValues(new Uint8Array(8))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

// So du hien tai = SUM(amount) cua ledger (append-only). Tra 0 neu chua co dong nao.
export async function getBalance(env, customerId) {
  const row = await env.DB.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS bal FROM studio_credit_ledger WHERE customer_id = ?1"
  ).bind(customerId).first();
  return row ? Number(row.bal) || 0 : 0;
}

// Cong/tru credit bang 1 dong ledger. Voi amount am (chi tieu): ghi co dieu
// kien trong cung 1 transaction batch de khong am vi (check so du truoc khi ghi
// o tang goi — Pages Functions chay don luong theo request nen du an toan cho
// quy mo hien tai; khi len Queue worker se doi sang UPDATE ... WHERE balance>=cost).
export async function addLedger(env, customerId, amount, reason, refId, label) {
  const before = await getBalance(env, customerId);
  const after = before + amount;
  if (after < 0) return { ok: false, balance: before };
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO studio_credit_ledger (id, customer_id, amount, reason, ref_id, label, balance_after, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
  ).bind(newStudioId("led"), customerId, amount, reason, refId || null, label || null, after, now).run();
  return { ok: true, balance: after };
}

export function generationOut(r) {
  return {
    id: r.id,
    kind: r.kind,
    prompt: r.prompt,
    model: r.model,
    modelName: r.model_name,
    params: r.params_json ? safeParse(r.params_json) : null,
    status: r.status,
    creditCost: r.credit_cost,
    resultUrl: r.result_url || null,
    error: r.error || null,
    createdAt: r.created_at,
    completedAt: r.completed_at || null,
    expiresAt: r.expires_at,
  };
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }
