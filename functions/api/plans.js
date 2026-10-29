// GET /api/plans — cong khai bang gia phia server (getPlans) de trang tai
// khoan tu dong theo. Doi gia chinh thuc = sua PLANS trong index.html +
// functions/api/_lib.js; account.html khong can sua tay nua (no chi con ban
// sao du phong khi fetch loi). Gia chua chot -> month/year = null.
import { json, errorJson, getPlans } from "./_lib.js";

export function onRequestGet({ env }) {
  return json(getPlans(env));
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ GET.", 405);
}
