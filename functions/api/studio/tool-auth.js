// /api/studio/tool-auth — dang nhap Dreamina cho Studio, theo DUNG logic
// cua Dreamina Tool (ban zip user gui, src/auth.ts): OAuth device flow
// chinh thuc qua CLI — POST /api/auth/login tra link uy quyen + ma nhap tay
// + han; tool tu chay vong cho (auth wait) o nen; web chi doc trang thai
// qua GET /api/auth/status va hien pending cho user duyet.
// Web khong tu chay CLI: moi thao tac proxy sang tool qua STUDIO_TOOL_URL
// (profile mac dinh "default" — cung profile ma seam generations dung).
// Bat buoc dang nhap HORA (requireAuth): link/ma uy quyen la thong tin nhay
// cam, khong phoi bay cong khai.
import { json, errorJson, requireAuth } from "../_lib.js";
import { toolBase, toolHeaders } from "./_studio.js";

const PROFILE = "default";

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.response) return a.response;

  const base = toolBase(env);
  if (!base) return json({ connected: false });

  try {
    const r = await fetch(base + "/api/auth/status?profile=" + PROFILE, { headers: toolHeaders(env) });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d) {
      return json({ connected: true, loggedIn: false, error: "Tool trả lỗi khi kiểm tra đăng nhập (HTTP " + r.status + ")." });
    }
    return json({
      connected: true,
      loggedIn: !!d.loggedIn,
      account: d.account || null,
      region: d.region || null,
      pending: d.pending || null,
      binaryMissing: !!d.binaryMissing,
      error: d.error || null,
    });
  } catch (e) {
    return json({ connected: false, unreachable: true });
  }
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.response) return a.response;

  const base = toolBase(env);
  if (!base) return errorJson("TOOL_NOT_CONNECTED", "Chưa nối Dreamina Tool (STUDIO_TOOL_URL).", 503);

  let body = {};
  try { body = await request.json(); } catch (e) { /* body rong */ }
  const action = body && body.action;

  if (action === "login") {
    try {
      const r = await fetch(base + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...toolHeaders(env) },
        body: JSON.stringify({ profile: PROFILE }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) return errorJson("TOOL_LOGIN_FAILED", (d && d.error) || ("Tool từ chối đăng nhập (HTTP " + r.status + ")."), 502);
      return json({ pending: (d && d.pending) || null });
    } catch (e) {
      return errorJson("TOOL_UNREACHABLE", "Không tới được Dreamina Tool.", 502);
    }
  }

  if (action === "logout") {
    try {
      const r = await fetch(base + "/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...toolHeaders(env) },
        body: JSON.stringify({ profile: PROFILE }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) return errorJson("TOOL_LOGOUT_FAILED", (d && d.error) || ("Tool từ chối đăng xuất (HTTP " + r.status + ")."), 502);
      return json({ ok: true });
    } catch (e) {
      return errorJson("TOOL_UNREACHABLE", "Không tới được Dreamina Tool.", 502);
    }
  }

  return errorJson("BAD_ACTION", "action phải là 'login' hoặc 'logout'.", 400);
}
