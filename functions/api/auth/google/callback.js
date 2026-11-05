// GET /api/auth/google/callback — Google tra ve kem ?code=...&state=...
// Redirect URI nay phai KHOP TUYET DOI ban da dang ky trong Google Console:
//   https://hora.works/api/auth/google/callback
// Buoc: kiem state (cookie) -> doi code lay id_token -> xac minh id_token
// qua tokeninfo cua Google (aud/iss/exp/email_verified) -> tim/tao khach
// -> tao phien dang nhap (cookie hora_session nhu dang nhap thuong)
// -> 302 ve dich da luu (mac dinh /account.html).
// Loi -> 302 ve /account.html?auth_error=<code> de trang tai khoan hien
// thong bao tieng Viet (khong bao gio de khach thay JSON tho).
import { parseCookies, createSession, getSessionCustomer } from "../../_lib.js";
import { googleConfig, isGoogleConfigured, googleRedirectUri, findOrCreateGoogleCustomer, linkGoogleToCustomer } from "../../_google.js";
import { GOOGLE_STATE_COOKIE, GOOGLE_RETURN_COOKIE, GOOGLE_LINK_COOKIE, oauthCookie } from "../google.js";

function fail(request, code) {
  const origin = new URL(request.url).origin;
  const headers = new Headers({ Location: `${origin}/account.html?auth_error=${code}` });
  headers.append("Set-Cookie", oauthCookie(request, GOOGLE_STATE_COOKIE, "", 0));
  headers.append("Set-Cookie", oauthCookie(request, GOOGLE_RETURN_COOKIE, "", 0));
  headers.append("Set-Cookie", oauthCookie(request, GOOGLE_LINK_COOKIE, "", 0));
  return new Response(null, { status: 302, headers });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (url.searchParams.get("error")) return fail(request, "denied");
  if (!isGoogleConfigured(env)) return fail(request, "not_configured");
  const { clientId, clientSecret } = googleConfig(env);

  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const cookies = parseCookies(request);
  const savedState = cookies[GOOGLE_STATE_COOKIE] || "";
  if (!code || !state || !savedState || state !== savedState) return fail(request, "state");

  let returnTo = "/account.html";
  try {
    const saved = decodeURIComponent(cookies[GOOGLE_RETURN_COOKIE] || "");
    if (saved && saved.startsWith("/") && !saved.startsWith("//") && saved.length <= 500) returnTo = saved;
  } catch { /* cookie hong -> ve mac dinh */ }

  // 1) Doi code -> token
  let tokenData = null;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: googleRedirectUri(request),
        grant_type: "authorization_code",
      }).toString(),
    });
    tokenData = await res.json().catch(() => null);
    if (!res.ok || !tokenData || !tokenData.id_token) return fail(request, "token");
  } catch {
    return fail(request, "token");
  }

  // 2) Xac minh id_token qua tokeninfo (Google tu kiem chu ky + het han)
  let claims = null;
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenData.id_token)}`);
    claims = await res.json().catch(() => null);
    if (!res.ok || !claims) return fail(request, "token");
  } catch {
    return fail(request, "token");
  }
  const issOk = claims.iss === "accounts.google.com" || claims.iss === "https://accounts.google.com";
  const expOk = Number(claims.exp || 0) * 1000 > Date.now();
  if (!issOk || !expOk || claims.aud !== clientId || !claims.sub || !claims.email) return fail(request, "token");
  if (!(claims.email_verified === "true" || claims.email_verified === true)) return fail(request, "unverified_email");

  // Ten hien thi: id_token co the kem ten; thieu thi hoi them userinfo.
  let displayName = claims.name || "";
  if (!displayName && tokenData.access_token) {
    try {
      const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const info = await res.json().catch(() => null);
      if (info && info.sub === claims.sub) displayName = info.name || "";
    } catch { /* ten chi la phu — bo qua khi loi */ }
  }

  // 3) Nhanh LIEN KET: co cookie hora_g_link thi gan Google nay vao tai
  // khoan dang dang nhap (khong tao phien moi, khong tim/tao khach).
  const linkCustomerId = cookies[GOOGLE_LINK_COOKIE] || "";
  if (linkCustomerId) {
    try {
      const me = await getSessionCustomer(env, request);
      if (!me || me.id !== linkCustomerId) return fail(request, "link_login_required");
      const r = await linkGoogleToCustomer(env, request, me.id, { sub: claims.sub, email: claims.email });
      if (!r.ok) return fail(request, r.code);
      const sep = returnTo.includes("?") ? "&" : "?";
      const headers = new Headers({ Location: `${url.origin}${returnTo}${sep}google_linked=1` });
      headers.append("Set-Cookie", oauthCookie(request, GOOGLE_STATE_COOKIE, "", 0));
      headers.append("Set-Cookie", oauthCookie(request, GOOGLE_RETURN_COOKIE, "", 0));
      headers.append("Set-Cookie", oauthCookie(request, GOOGLE_LINK_COOKIE, "", 0));
      return new Response(null, { status: 302, headers });
    } catch (err) {
      console.warn("google callback: link failed:", err && err.message ? err.message : String(err));
      return fail(request, "server");
    }
  }

  // 4) Tim/tao khach + tao phien
  try {
    const { customer } = await findOrCreateGoogleCustomer(env, request, {
      sub: claims.sub,
      email: claims.email,
      name: displayName,
    });
    const session = await createSession(env, customer.id);
    const headers = new Headers({ Location: `${url.origin}${returnTo}` });
    headers.append("Set-Cookie", session.cookie);
    headers.append("Set-Cookie", oauthCookie(request, GOOGLE_STATE_COOKIE, "", 0));
    headers.append("Set-Cookie", oauthCookie(request, GOOGLE_RETURN_COOKIE, "", 0));
    headers.append("Set-Cookie", oauthCookie(request, GOOGLE_LINK_COOKIE, "", 0));
    return new Response(null, { status: 302, headers });
  } catch (err) {
    console.warn("google callback: create customer/session failed:", err && err.message ? err.message : String(err));
    return fail(request, "server");
  }
}

