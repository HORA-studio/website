/**
 * Quản lý đăng nhập Dreamina qua CLI — luồng OAuth device flow chính thức:
 * auth login → trả link + mã → user duyệt trên trình duyệt → auth wait hoàn tất.
 * Mỗi "tài khoản" trong tool = 1 profile của CLI (--profile).
 */
import { runCli, cliErrorText, CliResult } from "./cli.js";
import { getProfileProxyInfo, ensureProfile } from "./profiles.js";

export interface PendingLogin {
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresAt: string;
  state: "waiting" | "logged_in" | "expired" | "failed";
  error?: string;
}

const pendingByProfile = new Map<string, PendingLogin & { deviceCode: string }>();
const waitRunning = new Set<string>();

export function getPending(profile: string): PendingLogin | null {
  const p = pendingByProfile.get(profile || "default");
  if (!p) return null;
  const { deviceCode: _dc, ...pub } = p;
  return pub;
}

async function waitLoop(profile: string, deviceCode: string): Promise<void> {
  if (waitRunning.has(profile)) return;
  waitRunning.add(profile);
  try {
    for (let i = 0; i < 12; i++) {
      const rec = pendingByProfile.get(profile);
      if (!rec || rec.deviceCode !== deviceCode) return; // đã bị thay bằng lần login khác
      const r = await runCli(["auth", "wait", "--device-code", deviceCode, "--timeout", "55s"], {
        profile,
        timeoutMs: 75_000,
      });
      if (r.ok && r.data?.status === "logged_in") {
        rec.state = "logged_in";
        return;
      }
      const code = r.error?.code;
      if (code === 40014) {
        rec.state = "expired";
        return;
      }
      if (r.ok) {
        // trạng thái lạ — kiểm tra lại bằng auth status
        const s = await runCli(["auth", "status"], { profile, timeoutMs: 20_000 });
        if (s.ok && s.data?.loggedIn) {
          rec.state = "logged_in";
          return;
        }
      }
      // 40011 = hết 1 lượt chờ, challenge còn hạn → lặp tiếp
      await new Promise((res) => setTimeout(res, 2000));
    }
    const rec = pendingByProfile.get(profile);
    if (rec && rec.deviceCode === deviceCode && rec.state === "waiting") rec.state = "expired";
  } finally {
    waitRunning.delete(profile);
  }
}

export async function startLogin(
  profile: string
): Promise<{ ok: true; pending: PendingLogin } | { ok: false; error: string }> {
  const prof = profile || "default";
  ensureProfile(prof); // đăng nhập qua luồng cũ cũng tự vào sổ danh sách tài khoản
  const r = await runCli(["auth", "login"], { profile: prof, timeoutMs: 60_000 });
  if (!r.ok) return { ok: false, error: cliErrorText(r) };
  if (r.data?.status === "logged_in" || r.data?.status === "reused") {
    pendingByProfile.delete(prof);
    return {
      ok: true,
      pending: {
        userCode: "",
        verificationUri: "",
        verificationUriComplete: "",
        expiresAt: "",
        state: "logged_in",
      },
    };
  }
  const ch = r.data?.challenge;
  if (!ch?.deviceCode) {
    return { ok: false, error: "CLI không trả challenge đăng nhập — xem log CLI để chẩn đoán" };
  }
  const rec: PendingLogin & { deviceCode: string } = {
    deviceCode: ch.deviceCode,
    userCode: ch.userCode || "",
    verificationUri: ch.verificationUri || "",
    verificationUriComplete: ch.verificationUriComplete || ch.verificationUri || "",
    expiresAt: ch.expiresAt || "",
    state: "waiting",
  };
  pendingByProfile.set(prof, rec);
  void waitLoop(prof, ch.deviceCode);
  const { deviceCode: _dc, ...pub } = rec;
  return { ok: true, pending: pub };
}

export interface AuthStatus {
  binaryMissing?: boolean;
  loggedIn: boolean;
  profile: string;
  region?: string;
  account: any | null;
  pending: PendingLogin | null;
  /** Proxy của profile (đã che mật khẩu) — set=false nghĩa là đi thẳng bằng IP máy */
  proxy: { set: boolean; masked: string };
  error?: string;
}

export async function getAuthStatus(profile: string): Promise<AuthStatus> {
  const prof = profile || "default";
  const r: CliResult = await runCli(["auth", "status"], { profile: prof, timeoutMs: 30_000 });
  if (!r.ok) {
    return {
      loggedIn: false,
      profile: prof,
      account: null,
      pending: getPending(prof),
      proxy: getProfileProxyInfo(prof),
      error: cliErrorText(r),
      binaryMissing: r.exitCode === -1,
    };
  }
  const loggedIn = !!r.data?.loggedIn;
  let account: any = null;
  if (loggedIn) {
    const a = await runCli(["auth", "account"], { profile: prof, timeoutMs: 30_000 });
    if (a.ok) account = a.data;
  }
  return {
    loggedIn,
    profile: prof,
    region: r.data?.region,
    account,
    pending: getPending(prof),
    proxy: getProfileProxyInfo(prof),
  };
}

export async function logout(profile: string): Promise<{ ok: boolean; error?: string }> {
  const prof = profile || "default";
  const r = await runCli(["auth", "logout"], { profile: prof, timeoutMs: 30_000 });
  pendingByProfile.delete(prof);
  if (!r.ok) return { ok: false, error: cliErrorText(r) };
  return { ok: true };
}
