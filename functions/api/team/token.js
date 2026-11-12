// POST /api/team/token — cap/xoay khoa API may cua CHINH MINH.
// Bat buoc dang nhap web bang cookie (khoa API khong tu cap lai khoa moi).
// Khoa ro chi tra 1 lan trong response nay; D1 chi luu ban bam SHA-256.
import { json, errorJson } from "../_lib.js";
import { getCookieMember, issueApiToken } from "./_team.js";

export async function onRequestPost({ request, env }) {
  const me = await getCookieMember(env, request);
  if (!me) return errorJson("UNAUTHORIZED", "Cần đăng nhập web để cấp khóa API.", 401);
  const token = await issueApiToken(env, me.name);
  return json({ name: me.name, token });
}
