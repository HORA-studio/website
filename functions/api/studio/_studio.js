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
  "topup-50": { name: "Nạp 50K", credits: 100, amountVnd: 50000 },
  "topup-100": { name: "Nạp 100K", credits: 200, amountVnd: 100000 },
  "topup-200": { name: "Nạp 200K", credits: 400, amountVnd: 200000 },
  "topup-500": { name: "Nạp 500K", credits: 1000, amountVnd: 500000 },
  "topup-1000": { name: "Nạp 1000K", credits: 2000, amountVnd: 1000000 },
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

// ===== Provider gen that: Dreamina Tool (tools/dreamina-tool) =====
// Tool chay bang Node tren may co dang nhap Dreamina (OAuth qua CLI
// dreamina-canvas), nghe HTTP API: POST /api/jobs, GET /api/jobs/:id,
// GET /files/<jobId>/<file>. Website chi noi khi dat bien moi truong
// STUDIO_TOOL_URL (vd http://127.0.0.1:5100 khi chay cung may, hoac URL
// tunnel/public cua may chay tool). Chua dat -> generation dung o 'queued'
// nhu truoc. STUDIO_TOOL_CEILING: tran credit Dreamina tu duyet cho moi job
// (0 = moi job cho duyet tay trong tool). STUDIO_TOOL_IMAGE_MODEL /
// STUDIO_TOOL_VIDEO_MODEL: ghi de model id phia Dreamina khi can.
export function toolBase(env) {
  const u = (env && env.STUDIO_TOOL_URL) || "";
  return u ? String(u).replace(/\/+$/, "") : null;
}
export function toolModelId(env, kind, model) {
  const over = kind === "video" ? env.STUDIO_TOOL_VIDEO_MODEL : env.STUDIO_TOOL_IMAGE_MODEL;
  return over ? String(over) : model.id;
}
export async function toolCreateJob(env, payload) {
  const base = toolBase(env);
  if (!base) return { ok: false, skipped: true };
  try {
    const r = await fetch(base + "/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => null);
    if (r.status === 201 && data && data.job) return { ok: true, job: data.job };
    return { ok: false, status: r.status, error: (data && data.error) || "HTTP " + r.status };
  } catch (e) {
    return { ok: false, network: true, error: String((e && e.message) || e) };
  }
}
export async function toolGetJob(env, id) {
  const base = toolBase(env);
  if (!base) return { ok: false, skipped: true };
  try {
    const r = await fetch(base + "/api/jobs/" + encodeURIComponent(id));
    const data = await r.json().catch(() => null);
    if (r.ok && data && data.job) return { ok: true, job: data.job };
    return { ok: false, status: r.status };
  } catch (e) {
    return { ok: false, network: true };
  }
}
export function toolFileUrl(env, job) {
  const base = toolBase(env);
  if (!base || !job || !Array.isArray(job.results)) return null;
  const f = job.results.find((x) => x && x.file);
  return f ? base + "/files/" + job.id + "/" + encodeURIComponent(f.file) : null;
}
