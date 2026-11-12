/**
 * Cấu hình riêng theo profile (= tài khoản Dreamina): hiện có proxy ra ngoài.
 *
 * CLI dreamina-canvas là chương trình Go — nó đọc biến môi trường
 * HTTP_PROXY/HTTPS_PROXY chuẩn. Tool lưu proxy theo từng profile ở
 * data/profiles.json và truyền biến vào mọi tiến trình CLI của profile đó
 * (đăng nhập, báo giá, chạy job...) qua điểm chung runCli.
 *
 * Định dạng proxy nhận vào:
 *   host:port
 *   host:port:user:pass
 *   http://user:pass@host:port   (hỗ trợ http, https, socks5, socks5h)
 * Chuẩn hoá về dạng URL đầy đủ khi lưu; khi hiển thị luôn che mật khẩu.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const storeFile = path.join(rootDir, "data", "profiles.json");

interface ProfileCfg {
  proxy?: string;
}

let cache: Record<string, ProfileCfg> | null = null;

function load(): Record<string, ProfileCfg> {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(storeFile, "utf8"));
    cache = raw && typeof raw === "object" ? raw : {};
  } catch {
    cache = {};
  }
  return cache!;
}

function persist() {
  fs.mkdirSync(path.dirname(storeFile), { recursive: true });
  fs.writeFileSync(storeFile, JSON.stringify(load(), null, 2), "utf8");
}

const SCHEMES = ["http:", "https:", "socks5:", "socks5h:"];

/** Chuẩn hoá chuỗi proxy người dùng nhập về URL đầy đủ; ném Error dễ đọc nếu sai định dạng. */
export function normalizeProxy(raw: string): string {
  const s = (raw || "").trim();
  if (!s) throw new Error("Proxy trống — muốn bỏ proxy hãy dùng nút Xoá proxy");
  let candidate: string;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) {
    candidate = s;
  } else if (s.includes("@")) {
    candidate = "http://" + s;
  } else {
    const parts = s.split(":");
    if (parts.length === 2) {
      candidate = `http://${parts[0]}:${parts[1]}`;
    } else if (parts.length === 4 && /^\d+$/.test(parts[1])) {
      candidate = `http://${encodeURIComponent(parts[2])}:${encodeURIComponent(parts[3])}@${parts[0]}:${parts[1]}`;
    } else {
      throw new Error(
        "Định dạng proxy chưa đúng — dùng host:port, host:port:user:pass hoặc http://user:pass@host:port"
      );
    }
  }
  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    throw new Error("Định dạng proxy chưa đúng — dùng host:port, host:port:user:pass hoặc http://user:pass@host:port");
  }
  if (!SCHEMES.includes(u.protocol)) {
    throw new Error(`Scheme proxy "${u.protocol}" chưa hỗ trợ — dùng http, https hoặc socks5`);
  }
  if (!u.hostname) throw new Error("Proxy thiếu host");
  if (u.port) {
    const n = Number(u.port);
    if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error("Cổng proxy không hợp lệ (1–65535)");
  }
  const auth = u.username
    ? `${encodeURIComponent(decodeURIComponent(u.username))}:${encodeURIComponent(decodeURIComponent(u.password || ""))}@`
    : "";
  return `${u.protocol}//${auth}${u.hostname}${u.port ? ":" + u.port : ""}`;
}

/** Che mật khẩu khi hiển thị: http://user:***@host:port */
export function maskProxy(normalized: string): string {
  try {
    const u = new URL(normalized);
    const auth = u.username ? `${decodeURIComponent(u.username)}:***@` : "";
    return `${u.protocol}//${auth}${u.hostname}${u.port ? ":" + u.port : ""}`;
  } catch {
    return "(proxy không đọc được)";
  }
}

export function getProfileProxy(profile: string): string | null {
  const cfg = load()[profile || "default"];
  return cfg?.proxy || null;
}

export function getProfileProxyInfo(profile: string): { set: boolean; masked: string } {
  const p = getProfileProxy(profile);
  return p ? { set: true, masked: maskProxy(p) } : { set: false, masked: "" };
}

/** Đặt proxy cho profile (raw rỗng = xoá). Trả về thông tin đã che để hiển thị. */
export function setProfileProxy(profile: string, raw: string): { set: boolean; masked: string } {
  const prof = profile || "default";
  const all = load();
  if (!raw || !raw.trim()) {
    if (all[prof]) delete all[prof].proxy;
  } else {
    all[prof] = { ...(all[prof] || {}), proxy: normalizeProxy(raw) };
  }
  persist();
  return getProfileProxyInfo(prof);
}

/** Biến môi trường proxy cho tiến trình CLI của profile này (null = đi thẳng). */
export function proxyEnvFor(profile: string): Record<string, string> | null {
  const p = getProfileProxy(profile);
  if (!p) return null;
  return {
    HTTP_PROXY: p,
    HTTPS_PROXY: p,
    http_proxy: p,
    https_proxy: p,
    NO_PROXY: "localhost,127.0.0.1",
    no_proxy: "localhost,127.0.0.1",
  };
}
