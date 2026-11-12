/**
 * Lớp gọi dreamina-canvas CLI chính thức của Dreamina/CapCut.
 * Mọi thao tác đều qua binary này — tool không tự gọi API nội bộ nữa.
 */
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { proxyEnvFor } from "./profiles.js";

export interface CliResult {
  ok: boolean;
  exitCode: number;
  data: any;
  error: { code?: number; message?: string; reason?: string; diagnostics?: any[]; raw?: string } | null;
  stdout: string;
  stderr: string;
}

let cachedBin: string | null = null;

/** Tìm binary dreamina-canvas: env DREAMINA_BIN → PATH → ~/.local/bin → ~/bin */
export function findBinary(): string | null {
  if (cachedBin && fs.existsSync(cachedBin)) return cachedBin;
  const exe = process.platform === "win32" ? "dreamina-canvas.exe" : "dreamina-canvas";
  const candidates: string[] = [];
  if (process.env.DREAMINA_BIN) candidates.push(process.env.DREAMINA_BIN);
  const pathEnv = process.env.PATH || "";
  for (const dir of pathEnv.split(path.delimiter)) {
    if (dir) candidates.push(path.join(dir, exe));
  }
  candidates.push(path.join(os.homedir(), ".local", "bin", exe));
  candidates.push(path.join(os.homedir(), "bin", exe));
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) {
        cachedBin = c;
        return c;
      }
    } catch {
      /* bỏ qua */
    }
  }
  return null;
}

export function binaryFound(): boolean {
  return findBinary() !== null;
}

/**
 * Chạy 1 lệnh CLI với --format json --non-interactive.
 * profile: truyền vào khi khác "default".
 */
export function runCli(
  args: string[],
  opts: { profile?: string; timeoutMs?: number; yes?: boolean } = {}
): Promise<CliResult> {
  const bin = findBinary();
  if (!bin) {
    return Promise.resolve({
      ok: false,
      exitCode: -1,
      data: null,
      error: {
        message:
          "Không tìm thấy dreamina-canvas CLI trên máy này. Hãy cài bằng lệnh của nhà cung cấp (xem README) hoặc đặt biến DREAMINA_BIN trỏ tới file binary.",
      },
      stdout: "",
      stderr: "",
    });
  }
  const fullArgs = ["--format", "json", "--non-interactive"];
  if (opts.yes) fullArgs.push("--yes");
  if (opts.profile && opts.profile !== "default") fullArgs.push("--profile", opts.profile);
  fullArgs.push(...args);
  const timeoutMs = opts.timeoutMs ?? 120_000;

  return new Promise((resolve) => {
    // Profile có đặt proxy → truyền HTTP(S)_PROXY vào tiến trình CLI (CLI là
    // chương trình Go, đọc biến môi trường proxy chuẩn). Không đặt → kế thừa
    // nguyên môi trường của tool như cũ.
    const proxyEnv = opts.profile ? proxyEnvFor(opts.profile) : null;
    const child = spawn(bin, fullArgs, {
      windowsHide: true,
      ...(proxyEnv ? { env: { ...process.env, ...proxyEnv } } : {}),
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({
        ok: false,
        exitCode: -2,
        data: null,
        error: { message: `CLI chạy quá ${Math.round(timeoutMs / 1000)}s không trả kết quả (đã hủy)` },
        stdout: out,
        stderr: err,
      });
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        exitCode: -1,
        data: null,
        error: { message: `Không chạy được CLI: ${e.message}` },
        stdout: out,
        stderr: err,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      let parsed: any = null;
      try {
        parsed = JSON.parse(out);
      } catch {
        /* stdout không phải JSON — thử stderr (CLI in phong bì lỗi ra stderr ở một số lệnh) */
        try {
          parsed = JSON.parse(err);
        } catch {
          parsed = null;
        }
      }
      if (parsed && typeof parsed === "object" && "ok" in parsed) {
        resolve({
          ok: !!parsed.ok,
          exitCode: code ?? 0,
          data: parsed.data ?? null,
          error: parsed.ok ? null : parsed.error || { message: "CLI báo lỗi không rõ" },
          stdout: out,
          stderr: err,
        });
      } else {
        resolve({
          ok: (code ?? 1) === 0,
          exitCode: code ?? 1,
          data: null,
          error:
            (code ?? 1) === 0
              ? null
              : { message: (err || out || "CLI lỗi không rõ").slice(0, 800) },
          stdout: out,
          stderr: err,
        });
      }
    });
  });
}

/** Chuỗi lỗi ngắn gọn, dễ đọc từ 1 CliResult — kèm chi tiết chẩn đoán nếu có */
export function cliErrorText(r: CliResult): string {
  if (!r.error) return "Lỗi không rõ";
  const parts: string[] = [];
  if (r.error.code !== undefined) parts.push(`[mã ${r.error.code}]`);
  if (r.error.message) parts.push(r.error.message);
  if (r.error.reason) parts.push(`(${r.error.reason})`);
  const diag = (r.error.diagnostics || [])
    .map((d: any) => d?.detail)
    .filter(Boolean)
    .join("; ");
  if (diag) parts.push(`— ${diag}`);
  return parts.join(" ") || "Lỗi không rõ";
}

let versionCache: { version: string; edition?: string } | null = null;
export async function cliVersion(): Promise<{ version: string; edition?: string } | null> {
  if (versionCache) return versionCache;
  const r = await runCli(["version"], { timeoutMs: 15_000 });
  if (r.ok && r.data?.version) {
    versionCache = { version: r.data.version, edition: r.data.edition };
    return versionCache;
  }
  return null;
}
