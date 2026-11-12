// POST /api/team/status { id, status } — doi trang thai 1 CAU HOI trong phong.
// status: 'open' | 'doing' | 'done'. Chi nguoi hoi, chu phong, hoac nguoi
// duoc gan ten (@mention) trong cau hoi moi doi duoc.
import { json, errorJson, readJson } from "../_lib.js";
import { getSessionMember } from "./_team.js";

const STATUSES = ["open", "doing", "done"];

export async function onRequestPost({ request, env }) {
  const me = await getSessionMember(env, request);
  if (!me) return errorJson("UNAUTHORIZED", "Chưa vào phòng.", 401);
  const body = await readJson(request);
  const id = Number(body?.id);
  const status = String(body?.status || "");
  if (!Number.isInteger(id) || id <= 0 || !STATUSES.includes(status)) {
    return errorJson("BAD_INPUT", "Thiếu id hoặc trạng thái không hợp lệ.", 400);
  }
  const { results } = await env.DB.prepare(
    "SELECT id, name, kind, mentions FROM team_messages WHERE id = ?1"
  ).bind(id).all();
  const msg = results?.[0];
  if (!msg) return errorJson("NOT_FOUND", "Không thấy tin nhắn này.", 404);
  if ((msg.kind || "chat") !== "question") {
    return errorJson("NOT_QUESTION", "Chỉ câu hỏi mới có trạng thái.", 400);
  }
  let mentions = [];
  try { mentions = JSON.parse(msg.mentions || "[]"); } catch { mentions = []; }
  const allowed = me.role === "owner" || me.name === msg.name || mentions.includes(me.name);
  if (!allowed) {
    return errorJson("FORBIDDEN", "Chỉ người hỏi, chủ phòng hoặc người được gắn tên mới đổi trạng thái.", 403);
  }
  await env.DB.prepare("UPDATE team_messages SET status = ?2 WHERE id = ?1")
    .bind(id, status).run();
  return json({ id, status });
}
