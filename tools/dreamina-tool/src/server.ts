/**
 * Server local của Dreamina Tool — bọc dreamina-canvas CLI chính thức.
 * API: trạng thái CLI/đăng nhập, model, canvas, job sinh ảnh/video.
 */
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { binaryFound, cliVersion, runCli, cliErrorText } from "./cli.js";
import { startLogin, getAuthStatus, logout } from "./auth.js";
import { setProfileProxy } from "./profiles.js";
import { createJob, listJobs, getJob, approveJob, loadJobs, resultsDir } from "./jobs.js";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(rootDir, "public");
const PORT = Number(process.env.PORT || 5100);
// Khi tool phơi ra internet qua tunnel để web gọi vào, đặt TOOL_TOKEN (chuỗi bí
// mật dùng chung với biến STUDIO_TOOL_TOKEN phía web) — mọi /api/* và /files/*
// đều phải mang header x-tool-token đúng mới qua. Không đặt = không kiểm tra
// (chạy local thuần). Giao diện web của chính tool (/) vẫn mở không cần token.
const TOOL_TOKEN = process.env.TOOL_TOKEN || "";

function sendJson(res: http.ServerResponse, code: number, obj: any) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > 64 * 1024 * 1024) {
        reject(new Error("Dữ liệu gửi lên quá lớn (tối đa 64MB)"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error("Body không phải JSON hợp lệ"));
      }
    });
    req.on("error", reject);
  });
}

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".json": "application/json",
};

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const p = url.pathname;
  const method = req.method || "GET";
  const profile = url.searchParams.get("profile") || "default";

  try {
    if (TOOL_TOKEN && (p.startsWith("/api/") || p.startsWith("/files/"))) {
      if (req.headers["x-tool-token"] !== TOOL_TOKEN) {
        return sendJson(res, 401, { error: "Thiếu hoặc sai x-tool-token (tool đang bật TOOL_TOKEN)" });
      }
    }

    if (method === "GET" && p === "/") {
      const html = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (method === "GET" && p === "/api/status") {
      const found = binaryFound();
      const ver = found ? await cliVersion() : null;
      return sendJson(res, 200, {
        binaryFound: found,
        version: ver?.version || null,
        edition: ver?.edition || null,
      });
    }

    if (method === "GET" && p === "/api/auth/status") {
      return sendJson(res, 200, await getAuthStatus(profile));
    }

    if (method === "POST" && p === "/api/auth/login") {
      const body = await readBody(req);
      const r = await startLogin(body.profile || "default");
      if (!r.ok) return sendJson(res, 400, { error: r.error });
      return sendJson(res, 200, { pending: r.pending });
    }

    if (method === "POST" && p === "/api/profiles/proxy") {
      const body = await readBody(req);
      const prof = String(body.profile || "default");
      try {
        const info = setProfileProxy(prof, body.proxy ?? "");
        return sendJson(res, 200, { ok: true, profile: prof, proxy: info });
      } catch (e: any) {
        return sendJson(res, 400, { error: e?.message || String(e) });
      }
    }

    if (method === "POST" && p === "/api/auth/logout") {
      const body = await readBody(req);
      const r = await logout(body.profile || "default");
      if (!r.ok) return sendJson(res, 400, { error: r.error });
      return sendJson(res, 200, { ok: true });
    }

    if (method === "GET" && p === "/api/models") {
      const type = url.searchParams.get("type") || "image";
      if (!["image", "video", "audio"].includes(type)) {
        return sendJson(res, 400, { error: "type phải là image|video|audio" });
      }
      const r = await runCli(["model", "list", "--type", type], { profile, timeoutMs: 60_000 });
      if (!r.ok) return sendJson(res, 400, { error: cliErrorText(r) });
      return sendJson(res, 200, { items: r.data?.items || [] });
    }

    if (method === "GET" && p === "/api/voices") {
      const r = await runCli(["voice", "list"], { profile, timeoutMs: 60_000 });
      if (!r.ok) return sendJson(res, 400, { error: cliErrorText(r) });
      return sendJson(res, 200, { data: r.data });
    }

    if (method === "GET" && p === "/api/canvases") {
      const r = await runCli(["canvas", "ls"], { profile, timeoutMs: 60_000 });
      if (!r.ok) return sendJson(res, 400, { error: cliErrorText(r) });
      return sendJson(res, 200, { data: r.data });
    }

    if (method === "POST" && p === "/api/canvases") {
      const body = await readBody(req);
      const name = (body.name || "").trim() || `Dreamina Tool ${new Date().toLocaleString("vi-VN")}`;
      const r = await runCli(["canvas", "create", name, "--use"], {
        profile: body.profile || "default",
        timeoutMs: 60_000,
      });
      if (!r.ok) return sendJson(res, 400, { error: cliErrorText(r) });
      return sendJson(res, 200, { data: r.data });
    }

    if (method === "POST" && p === "/api/canvases/use") {
      const body = await readBody(req);
      if (!body.projectId) return sendJson(res, 400, { error: "Thiếu projectId" });
      const r = await runCli(["canvas", "use", body.projectId], {
        profile: body.profile || "default",
        timeoutMs: 60_000,
      });
      if (!r.ok) return sendJson(res, 400, { error: cliErrorText(r) });
      return sendJson(res, 200, { data: r.data });
    }

    if (method === "POST" && p === "/api/jobs") {
      const body = await readBody(req);
      if (!body.prompt?.trim()) return sendJson(res, 400, { error: "Thiếu prompt" });
      if (!body.model?.trim()) return sendJson(res, 400, { error: "Thiếu model — hãy chọn model trong danh sách" });
      if (!["image", "video"].includes(body.kind)) {
        return sendJson(res, 400, { error: "kind phải là image|video" });
      }
      const job = createJob({
        kind: body.kind,
        profile: body.profile || "default",
        projectId: body.projectId || undefined,
        prompt: body.prompt.trim(),
        model: body.model.trim(),
        ratio: body.ratio || undefined,
        resolution: body.resolution || undefined,
        duration: body.duration ? Number(body.duration) : undefined,
        count: body.count ? Number(body.count) : 1,
        creditCeiling: body.creditCeiling !== undefined ? Number(body.creditCeiling) : 0,
        refs: Array.isArray(body.refs) ? body.refs : [],
      });
      return sendJson(res, 201, { job });
    }

    if (method === "GET" && p === "/api/jobs") {
      return sendJson(res, 200, { jobs: listJobs() });
    }

    const jobMatch = p.match(/^\/api\/jobs\/([0-9a-f-]{36})$/i);
    if (method === "GET" && jobMatch) {
      const job = getJob(jobMatch[1]);
      if (!job) return sendJson(res, 404, { error: "Không thấy job" });
      return sendJson(res, 200, { job });
    }

    const approveMatch = p.match(/^\/api\/jobs\/([0-9a-f-]{36})\/approve$/i);
    if (method === "POST" && approveMatch) {
      const body = await readBody(req);
      const job = await approveJob(approveMatch[1], Number(body.ceiling) || 0);
      if (!job) return sendJson(res, 404, { error: "Không thấy job đang chờ duyệt" });
      return sendJson(res, 200, { job });
    }

    if (method === "GET" && p.startsWith("/files/")) {
      const rest = decodeURIComponent(p.slice("/files/".length));
      const full = path.join(resultsDir, rest);
      if (!full.startsWith(resultsDir) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
        return sendJson(res, 404, { error: "Không thấy file" });
      }
      const ext = path.extname(full).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      fs.createReadStream(full).pipe(res);
      return;
    }

    return sendJson(res, 404, { error: "Không thấy đường dẫn" });
  } catch (e: any) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
}

export function startServer() {
  loadJobs();
  const server = http.createServer((req, res) => {
    void handle(req, res);
  });
  server.listen(PORT, () => {
    console.log(`Dreamina Tool đang chạy: http://localhost:${PORT}`);
    console.log(
      binaryFound()
        ? "Đã tìm thấy dreamina-canvas CLI."
        : "CHƯA tìm thấy dreamina-canvas CLI — cài theo README rồi chạy lại."
    );
    console.log(
      TOOL_TOKEN
        ? "Cổng token ĐANG BẬT: /api/* và /files/* cần header x-tool-token (UI sẽ hỏi token 1 lần)."
        : "Cổng token tắt (chưa đặt TOOL_TOKEN) — chỉ nên chạy local, đừng phơi ra internet."
    );
  });
}
