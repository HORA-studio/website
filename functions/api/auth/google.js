// GET /api/auth/google — bat dau dang nhap Google (OAuth 2.0).
// Tao state chong CSRF, luu vao cookie HttpOnly 10 phut (kem dich quay ve
// sau dang nhap neu hop le), roi 302 sang trang chon tai khoan cua Google.
// Dich quay ve (?return=...) chi nhan duong dan tuong doi tren cung site.
import { errorJson, getSessionCustomer } from "../_lib.js";
import { googleConfig, isGoogleConfigured, googleRedirectUri } from "../_google.js";

export const GOOGLE_STATE_COOKIE = "hora_g_state";
export const GOOGLE_RETURN_COOKIE = "hora_g_return";
export const GOOGLE_LINK_COOKIE = "hora_g_link";

function cookieFlags(request) {
  const url = new URL(request.url);
  // Local (http://localhost) khong dat Secure de cookie van gui duoc khi dev.
  return url.protocol === "https:" ? "; Secure" : "";
}

export function oauthCookie(request, name, value, maxAgeSeconds) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax${cookieFlags(request)}; Max-Age=${maxAgeSeconds}`;
}

function safeReturnTo(raw) {
  const v = String(raw || "").trim();
  if (!v || v.length > 500) return "/account.html";
  if (!v.startsWith("/") || v.startsWith("//")) return "/account.html";
  return v;
}

function notConfiguredPage() {
  const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><title>Đăng nhập Google chưa sẵn sàng</title>
<body style="font-family:system-ui;max-width:520px;margin:60px auto;padding:0 20px;line-height:1.7">
<h1 style="font-size:22px">Đăng nhập Google chưa được cấu hình</h1>
<p>Máy chủ chưa có <code>GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code>. Quản trị viên cần đặt 2 secret này cho Pages project rồi thử lại.</p>
<p><a href="/account.html">← Quay lại trang tài khoản</a></p></body></html>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function onRequestGet({ request, env }) {
  if (!isGoogleConfigured(env)) return notConfiguredPage();
  const { clientId } = googleConfig(env);

  const state = [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("return") || url.searchParams.get("next"));

  // mode=link: lien ket Google vao tai khoan DANG DANG NHAP (bat ky Google
  // nao, ke ca khac email). Bat buoc co phien dang nhap; id khach duoc luu
  // vao cookie rieng de callback doi chieu lai (chong gan vao tai khoan khac).
  let linkCustomerId = "";
  if (url.searchParams.get("mode") === "link") {
    const me = await getSessionCustomer(env, request);
    if (!me) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/account.html?auth_error=link_login_required" },
      });
    }
    linkCustomerId = me.id;
  }

  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("redirect_uri", googleRedirectUri(request));
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", "openid email profile");
  auth.searchParams.set("state", state);
  auth.searchParams.set("access_type", "online");
  auth.searchParams.set("prompt", "select_account");
  auth.searchParams.set("include_granted_scopes", "true");

  const headers = new Headers({ Location: auth.toString() });
  headers.append("Set-Cookie", oauthCookie(request, GOOGLE_STATE_COOKIE, state, 600));
  headers.append("Set-Cookie", oauthCookie(request, GOOGLE_RETURN_COOKIE, encodeURIComponent(returnTo), 600));
  headers.append("Set-Cookie", oauthCookie(request, GOOGLE_LINK_COOKIE, linkCustomerId, 600));
  return new Response(null, { status: 302, headers });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ GET.", 405);
}
