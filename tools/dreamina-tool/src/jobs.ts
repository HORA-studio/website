/**
 * Pipeline sinh ảnh/video qua dreamina-canvas CLI:
 *   tạo canvas (nếu chưa có) → upload ảnh đính kèm → tạo node → báo giá (quote)
 *   → duyệt credit (confirm, tự động trong trần cho phép hoặc chờ user duyệt)
 *   → chạy (run) → theo dõi (operation status) → tải kết quả về máy.
 * Mọi bước đều ghi log có timestamp để user nhìn thấy tool đang làm gì.
 */
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { runCli, cliErrorText } from "./cli.js";
import { getProfileProxyInfo } from "./profiles.js";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const dataDir = path.join(rootDir, "data");
export const resultsDir = path.join(dataDir, "results");
const jobsFile = path.join(dataDir, "jobs.json");
const uploadsDir = path.join(dataDir, "uploads");

export type JobStatus =
  | "queued"
  | "working"
  | "awaiting_approval"
  | "done"
  | "failed"
  | "interrupted";

export interface JobResult {
  resourceId: string;
  file?: string;
  state: string;
}

export interface Job {
  id: string;
  kind: "image" | "video";
  profile: string;
  projectId?: string;
  projectWebUrl?: string;
  prompt: string;
  model: string;
  mode: string;
  ratio?: string;
  resolution?: string;
  duration?: number;
  count: number;
  creditCeiling: number;
  nodeId?: string;
  submitId?: string;
  confirmToken?: string;
  quoteTotal?: number;
  confirmationRequired?: boolean;
  status: JobStatus;
  stage: string;
  results: JobResult[];
  error?: string;
  logs: { t: string; msg: string }[];
  createdAt: string;
  updatedAt: string;
}

const jobs = new Map<string, Job>();

function ensureDirs() {
  for (const d of [dataDir, resultsDir, uploadsDir]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

function persist() {
  ensureDirs();
  fs.writeFileSync(jobsFile, JSON.stringify([...jobs.values()], null, 2), "utf8");
}

export function loadJobs() {
  ensureDirs();
  try {
    if (fs.existsSync(jobsFile)) {
      const arr = JSON.parse(fs.readFileSync(jobsFile, "utf8"));
      if (Array.isArray(arr)) {
        for (const j of arr) {
          if (j.status === "working" || j.status === "queued") {
            if (j.submitId && j.projectId) {
              j.stage = "Đang khôi phục theo dõi sau khi server khởi động lại...";
            } else {
              j.status = "interrupted";
              j.stage = "Bị ngắt vì server khởi động lại trước khi gửi lệnh chạy";
            }
          }
          jobs.set(j.id, j);
        }
      }
    }
  } catch {
    /* file hỏng → bắt đầu trắng */
  }
  // khôi phục theo dõi các job đã gửi chạy
  for (const j of jobs.values()) {
    if (j.status === "working" && j.submitId && j.projectId) {
      void pollAndFinish(j).catch(() => undefined);
    }
  }
}

export function listJobs(): Job[] {
  return [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

function now() {
  return new Date().toISOString();
}

function log(job: Job, msg: string) {
  job.logs.push({ t: now(), msg });
  if (job.logs.length > 300) job.logs = job.logs.slice(-300);
  job.updatedAt = now();
  persist();
}

function fail(job: Job, stage: string, msg: string): Job {
  job.status = "failed";
  job.stage = stage;
  job.error = msg;
  log(job, `LỖI: ${msg}`);
  persist();
  return job;
}

/** Lấy sâu 1 khóa trong object (quét tối đa 3 tầng) — phòng khi CLI đổi cấu trúc nhẹ */
function deepFind(obj: any, key: string, depth = 0): any {
  if (!obj || typeof obj !== "object" || depth > 3) return undefined;
  if (typeof obj[key] === "string" && obj[key]) return obj[key];
  for (const v of Object.values(obj)) {
    const f = deepFind(v, key, depth + 1);
    if (f !== undefined) return f;
  }
  return undefined;
}

const SUCCESS = new Set(["succeeded", "success", "completed", "complete", "done"]);
const FAILED = new Set(["failed", "failure", "canceled", "cancelled", "error", "rejected"]);

export interface NewJobInput {
  kind: "image" | "video";
  profile: string;
  projectId?: string;
  prompt: string;
  model: string;
  ratio?: string;
  resolution?: string;
  duration?: number;
  count?: number;
  creditCeiling?: number;
  /** data URL của ảnh đính kèm (khung đầu/cuối hoặc ảnh tham chiếu) */
  refs?: string[];
}

export function createJob(input: NewJobInput): Job {
  const job: Job = {
    id: randomUUID(),
    kind: input.kind,
    profile: input.profile || "default",
    projectId: input.projectId || undefined,
    prompt: input.prompt,
    model: input.model,
    // mode được chọn lại chính xác theo model + refs trong resolveMode (trước khi tạo node)
    mode: "",
    ratio: input.ratio,
    resolution: input.resolution,
    duration: input.duration,
    count: Math.max(1, Math.min(10, input.count || 1)),
    creditCeiling: Math.max(0, Math.floor(input.creditCeiling || 0)),
    status: "queued",
    stage: "Đang chờ chạy",
    results: [],
    logs: [],
    createdAt: now(),
    updatedAt: now(),
  };
  jobs.set(job.id, job);
  log(
    job,
    `Tạo job ${job.kind === "image" ? "ảnh" : "video"} — model ${job.model}, trần tự duyệt ${job.creditCeiling} credit`
  );
  const px = getProfileProxyInfo(job.profile);
  if (px.set) log(job, `Đi qua proxy của tài khoản: ${px.masked}`);
  void runPipeline(job, input.refs || []).catch((e) => {
    fail(job, "Pipeline lỗi", e?.message || String(e));
  });
  return job;
}

async function ensureCanvas(job: Job): Promise<boolean> {
  if (job.projectId) return true;
  job.stage = "Đang tạo canvas mới trên Dreamina...";
  log(job, "Job chưa có canvas → tạo canvas mới");
  const name = `Dreamina Tool ${new Date().toLocaleString("vi-VN")}`;
  const r = await runCli(["canvas", "create", name, "--use"], {
    profile: job.profile,
    timeoutMs: 60_000,
  });
  if (!r.ok) {
    fail(job, "Tạo canvas thất bại", cliErrorText(r));
    return false;
  }
  job.projectId = r.data?.projectId || deepFind(r.data, "projectId");
  job.projectWebUrl = r.data?.webUrl || deepFind(r.data, "webUrl");
  if (!job.projectId) {
    fail(job, "Tạo canvas thất bại", "CLI không trả projectId của canvas mới");
    return false;
  }
  log(job, `Đã tạo canvas: ${job.projectId}`);
  persist();
  return true;
}

async function uploadRefs(job: Job, refs: string[]): Promise<string[] | null> {
  const ids: string[] = [];
  for (let i = 0; i < refs.length; i++) {
    const m = refs[i].match(/^data:([^;]+);base64,(.+)$/);
    if (!m) {
      fail(job, "Ảnh đính kèm không hợp lệ", `Ảnh thứ ${i + 1} không phải data URL base64`);
      return null;
    }
    const ext =
      m[1] === "image/png" ? "png" : m[1] === "image/webp" ? "webp" : m[1] === "image/gif" ? "gif" : "jpg";
    const file = path.join(uploadsDir, `${job.id}-${i}.${ext}`);
    fs.writeFileSync(file, Buffer.from(m[2], "base64"));
    job.stage = `Đang tải ảnh đính kèm ${i + 1}/${refs.length} lên Dreamina...`;
    log(job, `Upload ảnh đính kèm ${i + 1}: ${path.basename(file)}`);
    const r = await runCli(
      ["resource", "upload", "--file", file, "--project-id", job.projectId!],
      { profile: job.profile, timeoutMs: 120_000 }
    );
    if (!r.ok) {
      fail(job, "Upload ảnh đính kèm thất bại", cliErrorText(r));
      return null;
    }
    const rid = r.data?.resourceId || deepFind(r.data, "resourceId");
    if (!rid) {
      fail(job, "Upload ảnh đính kèm thất bại", "CLI không trả resourceId cho ảnh vừa tải lên");
      return null;
    }
    ids.push(rid);
    log(job, `Ảnh ${i + 1} đã lên: resource ${rid}`);
  }
  return ids;
}

/**
 * Chọn mode sinh hợp lệ theo model + số lượng ảnh đính kèm, dựa vào schema model thật
 * do CLI trả về (model list). Model video chỉ hỗ trợ vài mode (t2v / first_last_frame / m2v),
 * mỗi mode khai báo phạm vi refs. Trước đây tool ép cứng "có ảnh → first_last_frame",
 * gây lỗi CLI với model không hỗ trợ mode đó (vd gemini_omni chỉ có t2v, không nhận ảnh).
 * Trả về null + lý do nếu không có mode nào hợp lệ.
 */
async function resolveMode(
  job: Job,
  refCount: number,
  refTypes: string[]
): Promise<string | null> {
  if (job.kind === "image") {
    return refCount > 0 ? "i2i" : "t2i";
  }

  const r = await runCli(["model", "list", "--type", "video"], { profile: job.profile, timeoutMs: 60_000 });
  if (!r.ok) {
    fail(job, "Không lấy được schema model", cliErrorText(r));
    return null;
  }
  const item = (r.data?.items || []).find((m: any) => m.model === job.model);
  if (!item) {
    fail(job, "Model không tồn tại", `Model "${job.model}" không có trong danh sách model video của tài khoản`);
    return null;
  }

  const modes: any[] = item.modes || [];
  if (!modes.length) {
    fail(job, "Model không có mode", `Model "${job.model}" không khai báo mode sinh nào`);
    return null;
  }

  // không có ảnh → ưu tiên t2v (hoặc mode nào chấp nhận 0 ref)
  if (refCount === 0) {
    const noRef = modes.find((m) => {
      const refs = m.references || {};
      return (refs.min ?? 0) === 0;
    });
    const chosen = noRef || modes[0];
    job.mode = chosen.name;
    log(job, `Chọn mode ${chosen.name} cho model ${job.model} (không gắn ảnh)`);
    persist();
    return chosen.name;
  }

  // có ảnh → chọn mode nhận đủ refs.
  // ưu tiên first_last_frame khi đủ 1–2 ảnh; nếu không, m2v khi khớp phạm vi.
  const anyRefModes = modes.filter((m) => {
    const refs = m.references || {};
    return refs.max !== undefined && refs.max > 0;
  });
  if (!anyRefModes.length) {
    fail(job, "Model không hỗ trợ gắn ảnh", `Model "${job.model}" không hỗ trợ ảnh đính kèm (chỉ sinh text-to-video)`);
    return null;
  }

  const candidates = [...anyRefModes].sort((a, b) => {
    const fa = (a.references?.min ?? 0);
    const fb = (b.references?.min ?? 0);
    return fa - fb;
  });

  // khớp gambit: first_last_frame thường cần đúng min (1 hoặc 2 ảnh); m2v linh hoạt hơn
  const exact = candidates.filter((m) => refCount >= (m.references?.min ?? 0) && refCount <= (m.references?.max ?? 0));
  const pool = exact.length ? exact : candidates.filter((m) => refCount <= (m.references?.max ?? 0));
  const chosenMode = pool.find((m) => m.name !== "t2v") || pool[0];
  if (!chosenMode) {
    fail(job, "Số ảnh không khớp model", `Model "${job.model}" không có mode nào nhận ${refCount} ảnh đính kèm`);
    return null;
  }
  job.mode = chosenMode.name;
  log(job, `Chọn mode ${chosenMode.name} cho model ${job.model} với ${refCount} ảnh`);
  persist();
  return chosenMode.name;
}

async function runPipeline(job: Job, refs: string[]): Promise<void> {
  job.status = "working";
  if (!(await ensureCanvas(job))) return;

  let refIds: string[] = [];
  if (refs.length) {
    const up = await uploadRefs(job, refs);
    if (up === null) return;
    refIds = up;
  }

  // Chọn mode sinh chính xác theo model + refs (tránh sai mode gây lỗi CLI)
  const mode = await resolveMode(job, refs.length, []);
  if (!mode) return;

  // 1) Tạo node (chưa chạy)
  job.stage = "Đang tạo node trên canvas...";
  // CLI 1.3.0: --submit-id chỉ hợp lệ khi đi kèm --run; tạo node trước (không --run)
  // để lấy nodeId, rồi quote → confirm → run. submitId sinh ở bước chạy (doRun).
  const args: string[] = [
    "node", "create", job.kind,
    "--project-id", job.projectId!,
    "--mode", job.mode,
    "--model", job.model,
    "--prompt", job.prompt,
    "--title", job.prompt.slice(0, 60) || "Dreamina Tool",
    "--count", String(job.count),
  ];
  if (job.ratio) args.push("--ratio", job.ratio);
  if (job.resolution) args.push("--resolution", job.resolution);
  if (job.kind === "video" && job.duration) args.push("--duration", String(job.duration));
  for (const rid of refIds) args.push("--ref", `res:${rid}`);
  log(job, `Tạo node: ${job.kind} mode=${job.mode} model=${job.model}`);
  const cr = await runCli(args, { profile: job.profile, timeoutMs: 120_000 });
  if (!cr.ok) {
    fail(job, "Tạo node thất bại", cliErrorText(cr));
    return;
  }
  job.nodeId = cr.data?.node?.nodeId || deepFind(cr.data, "nodeId");
  if (!job.nodeId) {
    fail(job, "Tạo node thất bại", "CLI không trả nodeId");
    return;
  }
  log(job, `Đã tạo node ${job.nodeId}`);
  persist();

  await quoteAndMaybeRun(job);
}

async function quoteAndMaybeRun(job: Job): Promise<void> {
  // 2) Báo giá
  job.stage = "Đang lấy báo giá credit...";
  const q = await runCli(["node", "quote", "--node-id", job.nodeId!, "--project-id", job.projectId!], {
    profile: job.profile,
    timeoutMs: 60_000,
  });
  if (!q.ok) {
    fail(job, "Báo giá thất bại", cliErrorText(q));
    return;
  }
  const itemError = q.data?.items?.find((it: any) => it.error)?.error;
  if (itemError) {
    fail(job, "Báo giá thất bại", itemError.message || JSON.stringify(itemError).slice(0, 400));
    return;
  }
  job.quoteTotal = q.data?.totalMaxCredits ?? q.data?.items?.[0]?.maxCredits ?? 0;
  job.confirmationRequired = !!q.data?.confirmationRequired;
  log(
    job,
    `Báo giá: tối đa ${job.quoteTotal} credit${job.confirmationRequired ? " — cần duyệt credit" : " — không cần duyệt riêng"}`
  );
  persist();

  // 3) Duyệt nếu cần
  if (job.confirmationRequired) {
    if (job.quoteTotal! <= job.creditCeiling) {
      log(job, `Giá ${job.quoteTotal} nằm trong trần tự duyệt ${job.creditCeiling} → tự duyệt`);
      if (!(await doConfirm(job, job.creditCeiling))) return;
    } else {
      job.status = "awaiting_approval";
      job.stage = `Chờ duyệt: giá ${job.quoteTotal} credit vượt trần tự duyệt ${job.creditCeiling}`;
      log(job, job.stage + " — bấm nút Duyệt ở thẻ job để chạy tiếp");
      persist();
      return;
    }
  }
  await doRun(job);
}

async function doConfirm(job: Job, ceiling: number): Promise<boolean> {
  job.stage = "Đang xin token duyệt credit...";
  const c = await runCli(
    ["node", "confirm", "--node-id", job.nodeId!, "--credit-ceiling", String(ceiling), "--project-id", job.projectId!],
    { profile: job.profile, timeoutMs: 60_000 }
  );
  if (!c.ok) {
    fail(job, "Duyệt credit thất bại", cliErrorText(c));
    return false;
  }
  job.confirmToken = c.data?.creditConfirmationToken;
  if (!job.confirmToken) {
    fail(job, "Duyệt credit thất bại", "CLI không trả creditConfirmationToken");
    return false;
  }
  log(job, `Đã có token duyệt (trần ${ceiling} credit)`);
  return true;
}

/** User bấm Duyệt trên UI: nâng trần lên mức được duyệt rồi chạy tiếp */
export async function approveJob(id: string, ceiling: number): Promise<Job | null> {
  const job = jobs.get(id);
  if (!job || job.status !== "awaiting_approval") return null;
  job.creditCeiling = Math.max(ceiling, job.quoteTotal || 0);
  job.status = "working";
  log(job, `User đã duyệt trần ${job.creditCeiling} credit → chạy tiếp`);
  if (!(await doConfirm(job, job.creditCeiling))) return job;
  await doRun(job);
  return job;
}

async function doRun(job: Job): Promise<void> {
  job.stage = "Đang gửi lệnh chạy...";
  job.submitId = job.submitId || randomUUID();
  const args = [
    "node", "run",
    "--node-id", job.nodeId!,
    "--submit-id", job.submitId!, // CLI 1.3.0 yêu cầu submit-id ở node run (không phải node create)
    "--project-id", job.projectId!,
  ];
  if (job.confirmToken) args.push("--credit-token", job.confirmToken);
  job.confirmToken = undefined;
  const r = await runCli(args, { profile: job.profile, timeoutMs: 120_000 });
  if (!r.ok) {
    fail(job, "Gửi chạy thất bại", cliErrorText(r));
    return;
  }
  const item = r.data?.items?.[0];
  if (item?.error) {
    fail(job, "Gửi chạy thất bại", item.error.message || JSON.stringify(item.error).slice(0, 400));
    return;
  }
  log(job, `Đã gửi chạy — submitId ${job.submitId} (trạng thái: ${item?.state || "đã nhận"})`);
  persist();
  await pollAndFinish(job);
}

async function pollAndFinish(job: Job): Promise<void> {
  job.status = "working";
  job.stage = "Dreamina đang sinh... (theo dõi tiến trình)";
  const deadline = Date.now() + 30 * 60_000;
  let lastState = "";
  while (Date.now() < deadline) {
    const s = await runCli(
      ["operation", "status", job.submitId!, "--project-id", job.projectId!],
      { profile: job.profile, timeoutMs: 60_000 }
    );
    if (!s.ok) {
      // lỗi tạm thời khi tra trạng thái → ghi log, chờ rồi thử lại thay vì chết ngay
      log(job, `Tra trạng thái lỗi tạm thời: ${cliErrorText(s)} — sẽ thử lại`);
      await new Promise((res) => setTimeout(res, 10_000));
      continue;
    }
    const state = String(s.data?.state || "");
    const resources: any[] = s.data?.resources || [];
    if (state !== lastState) {
      log(job, `Trạng thái: ${state || "?"} — ${resources.map((x) => `${x.resourceId}:${x.state}`).join(", ") || "chưa có resource"}`);
      lastState = state;
    }
    const allDone = resources.length > 0 && resources.every((x) => SUCCESS.has(String(x.state)) || FAILED.has(String(x.state)));
    if (SUCCESS.has(state.toLowerCase()) || (allDone && resources.some((x) => SUCCESS.has(String(x.state))))) {
      job.results = resources.map((x) => ({ resourceId: x.resourceId, state: String(x.state) }));
      if (job.results.every((x) => FAILED.has(x.state))) {
        const msg = resources.find((x) => x.message)?.message || "Dreamina báo sinh thất bại";
        fail(job, "Sinh thất bại", msg);
        return;
      }
      await downloadResults(job);
      return;
    }
    if (FAILED.has(state.toLowerCase())) {
      const msg = s.data?.submissionError?.message || resources.find((x) => x.message)?.message || `Trạng thái cuối: ${state}`;
      fail(job, "Sinh thất bại", msg);
      return;
    }
    await new Promise((res) => setTimeout(res, 8_000));
  }
  fail(job, "Quá thời gian chờ", "Đã theo dõi 30 phút mà Dreamina chưa trả kết quả cuối — kiểm tra lại trên canvas web");
}

async function downloadResults(job: Job): Promise<void> {
  job.stage = "Đang tải kết quả về máy...";
  const outDir = path.join(resultsDir, job.id);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  for (const res of job.results) {
    if (!SUCCESS.has(res.state)) continue;
    const d = await runCli(
      ["resource", "download", res.resourceId, "--project-id", job.projectId!, "-o", outDir],
      { profile: job.profile, timeoutMs: 300_000 }
    );
    if (!d.ok) {
      log(job, `Tải resource ${res.resourceId} lỗi: ${cliErrorText(d)} — vẫn mở xem được trên canvas web`);
      continue;
    }
    log(job, `Đã tải resource ${res.resourceId}`);
  }
  // quét thư mục kết quả để gắn file vào job
  try {
    const files = fs.readdirSync(outDir).filter((f) => !f.startsWith("."));
    let idx = 0;
    for (const res of job.results) {
      if (!SUCCESS.has(res.state)) continue;
      if (files[idx]) res.file = files[idx++];
    }
    if (files.length && job.results.every((r) => !r.file)) {
      job.results = files.map((f, i) => ({
        resourceId: job.results[i]?.resourceId || `file-${i}`,
        state: "success",
        file: f,
      }));
    }
  } catch {
    /* bỏ qua */
  }
  job.status = "done";
  job.stage = "Hoàn tất";
  log(job, `Xong — ${job.results.filter((r) => r.file).length} file đã tải về`);
  persist();
}
