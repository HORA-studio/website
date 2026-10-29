// POST /api/auth/logout — xoa session phia server va xoa cookie.
import { json, errorJson, destroySession } from "../_lib.js";

export async function onRequestPost({ request, env }) {
  const cleared = await destroySession(env, request);
  return json({ ok: true }, 200, { "Set-Cookie": cleared });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}
