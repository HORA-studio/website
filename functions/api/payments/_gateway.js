// Module cong thanh toan: SePay (chinh) + MoMo + VNPay.
// SePay khac han 2 cong kia: KHONG co trang thanh toan redirect — khach chuyen
// khoan ngan hang kem MA RIENG trong noi dung, SePay quet tai khoan nguoi ban
// roi goi webhook ve website; website doi ma + so tien de ghi 'paid'.
// Thong tin merchant doc TU BIEN MOI TRUONG — chua cau hinh thi nem loi
// GATEWAY_NOT_CONFIGURED, TUYET DOI khong tra URL thanh toan gia.
// Stripe khong duoc dung: Stripe khong onboard merchant co tru so tai Viet Nam.
//
// Cac ham ky (sign/verify/build URL) la ham thuan (pure) de unit-test bang node.

const enc = new TextEncoder();

// ---------- HMAC bang WebCrypto ----------
async function hmacHex(algo, key, data) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: algo }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export const hmacSha256Hex = (key, data) => hmacHex("SHA-256", key, data);
export const hmacSha512Hex = (key, data) => hmacHex("SHA-512", key, data);

// ---------- Cau hinh ----------
export function isMomoConfigured(env = {}) {
  return Boolean(env.MOMO_PARTNER_CODE && env.MOMO_ACCESS_KEY && env.MOMO_SECRET_KEY);
}
export function isVnpayConfigured(env = {}) {
  return Boolean(env.VNPAY_TMN_CODE && env.VNPAY_HASH_SECRET);
}
export function isSepayConfigured(env = {}) {
  return Boolean(
    env.SEPAY_BANK_NAME && env.SEPAY_BANK_BIN && env.SEPAY_ACCOUNT_NUMBER && env.SEPAY_ACCOUNT_NAME
  );
}
export function isGatewayConfigured(env, gateway) {
  if (gateway === "sepay") return isSepayConfigured(env);
  if (gateway === "momo") return isMomoConfigured(env);
  if (gateway === "vnpay") return isVnpayConfigured(env);
  return false;
}
export function momoEndpoint(env = {}) {
  return env.MOMO_ENV === "production"
    ? "https://payment.momo.vn/v2/gateway/api/create"
    : "https://test-payment.momo.vn/v2/gateway/api/create";
}
export function vnpayEndpoint(env = {}) {
  return env.VNPAY_ENV === "production"
    ? "https://pay.vnpay.vn/paymentv2/vpcpay.html"
    : "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
}

// ---------- MoMo: tao thanh toan ----------
export function buildMomoCreateRawSignature(f, accessKey) {
  return (
    `accessKey=${accessKey}` +
    `&amount=${f.amount}` +
    `&extraData=${f.extraData || ""}` +
    `&ipnUrl=${f.ipnUrl}` +
    `&orderId=${f.orderId}` +
    `&orderInfo=${f.orderInfo}` +
    `&partnerCode=${f.partnerCode}` +
    `&redirectUrl=${f.redirectUrl}` +
    `&requestId=${f.requestId}` +
    `&requestType=${f.requestType || "captureWallet"}`
  );
}

export async function createMomoPayment(env, { orderId, requestId, amount, orderInfo, redirectUrl, ipnUrl }) {
  if (!isMomoConfigured(env)) throw Object.assign(new Error("MoMo chưa được cấu hình."), { code: "GATEWAY_NOT_CONFIGURED" });
  const fields = {
    partnerCode: env.MOMO_PARTNER_CODE,
    amount: String(Math.round(amount)),
    extraData: "",
    ipnUrl,
    orderId,
    orderInfo,
    redirectUrl,
    requestId: requestId || orderId,
    requestType: "captureWallet",
  };
  const raw = buildMomoCreateRawSignature(fields, env.MOMO_ACCESS_KEY);
  const signature = await hmacSha256Hex(env.MOMO_SECRET_KEY, raw);
  const res = await fetch(momoEndpoint(env), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      partnerCode: fields.partnerCode,
      partnerName: "HORA",
      storeId: "HORAStore",
      requestId: fields.requestId,
      amount: Number(fields.amount),
      orderId: fields.orderId,
      orderInfo: fields.orderInfo,
      redirectUrl: fields.redirectUrl,
      ipnUrl: fields.ipnUrl,
      lang: "vi",
      extraData: "",
      requestType: "captureWallet",
      signature,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.resultCode !== 0 || !data.payUrl) {
    throw Object.assign(new Error(`MoMo từ chối tạo thanh toán: ${(data && data.message) || res.status}`), { code: "GATEWAY_ERROR", raw: data });
  }
  return { paymentUrl: data.payUrl, gatewayOrderId: fields.orderId, raw: data };
}

// ---------- MoMo: xac minh IPN ----------
export function buildMomoIpnRawSignature(d, accessKey) {
  const get = (k) => (d[k] === undefined || d[k] === null ? "" : String(d[k]));
  return (
    `accessKey=${accessKey}` +
    `&amount=${get("amount")}` +
    `&extraData=${get("extraData")}` +
    `&message=${get("message")}` +
    `&orderId=${get("orderId")}` +
    `&orderInfo=${get("orderInfo")}` +
    `&orderType=${get("orderType")}` +
    `&partnerCode=${get("partnerCode")}` +
    `&payType=${get("payType")}` +
    `&requestId=${get("requestId")}` +
    `&responseTime=${get("responseTime")}` +
    `&resultCode=${get("resultCode")}` +
    `&transId=${get("transId")}`
  );
}

export async function verifyMomoIpnSignature(env, data) {
  if (!isMomoConfigured(env) || !data || !data.signature) return false;
  const raw = buildMomoIpnRawSignature(data, env.MOMO_ACCESS_KEY);
  const expected = await hmacSha256Hex(env.MOMO_SECRET_KEY, raw);
  return String(data.signature).toLowerCase() === expected.toLowerCase();
}

// ---------- VNPay: tao URL thanh toan ----------
export function formatVnpayDate(date = new Date()) {
  // VNPay dung gio VN (GMT+7), dinh dang yyyyMMddHHmmss.
  const vn = new Date(date.getTime() + 7 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${vn.getUTCFullYear()}${p(vn.getUTCMonth() + 1)}${p(vn.getUTCDate())}${p(vn.getUTCHours())}${p(vn.getUTCMinutes())}${p(vn.getUTCSeconds())}`;
}

export function buildVnpayBaseParams(env, { txnRef, amount, orderInfo, returnUrl, ipAddr, now }) {
  return {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: env.VNPAY_TMN_CODE,
    vnp_Amount: String(Math.round(amount) * 100), // VNPay tinh theo xu (x100)
    vnp_CurrCode: "VND",
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: "other",
    vnp_Locale: "vn",
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddr || "127.0.0.1",
    vnp_CreateDate: formatVnpayDate(now || new Date()),
  };
}

// Chuoi de ky: sap xep theo ten tham so, value duoc url-encode (space -> '+').
export function vnpayHashData(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
    .sort()
    .map((k) => `${k}=${encodeURIComponent(String(params[k])).replace(/%20/g, "+")}`)
    .join("&");
}

export async function buildVnpaySecureHash(params, secret) {
  return hmacSha512Hex(secret, vnpayHashData(params));
}

export async function buildVnpayUrl(env, opts) {
  if (!isVnpayConfigured(env)) throw Object.assign(new Error("VNPay chưa được cấu hình."), { code: "GATEWAY_NOT_CONFIGURED" });
  const params = buildVnpayBaseParams(env, opts);
  const secureHash = await buildVnpaySecureHash(params, env.VNPAY_HASH_SECRET);
  const url = `${vnpayEndpoint(env)}?${vnpayHashData(params)}&vnp_SecureHash=${secureHash}`;
  return { paymentUrl: url, gatewayOrderId: params.vnp_TxnRef, params };
}

// ---------- VNPay: xac minh checksum IPN/return ----------
export async function verifyVnpayChecksum(env, queryParams) {
  if (!isVnpayConfigured(env) || !queryParams || !queryParams.vnp_SecureHash) return false;
  const params = {};
  for (const [k, v] of Object.entries(queryParams)) {
    if (k.startsWith("vnp_") && k !== "vnp_SecureHash" && k !== "vnp_SecureHashType") params[k] = v;
  }
  const expected = await buildVnpaySecureHash(params, env.VNPAY_HASH_SECRET);
  return expected.toLowerCase() === String(queryParams.vnp_SecureHash).toLowerCase();
}

// ---------- SePay: ma thanh toan + huong dan chuyen khoan ----------
// Ma thanh toan cua 1 don: 'HORA' + 8 ky tu chu/so lay tu order id (order id da
// duy nhat nen ma duy nhat theo don). Ma nay luu o payments.gateway_order_id,
// khach ghi NGUYEN VAN vao noi dung chuyen khoan.
export function sepayPaymentCode(orderId) {
  const clean = String(orderId || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return "HORA" + clean.slice(-8);
}

// Chuan hoa de doi khop: viet hoa + bo moi ky tu khong phai chu/so
// (noi dung chuyen khoan thuong bi ngan hang doi dau cach/dau '-').
export function normalizePaymentText(s) {
  return String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Tim ma (dang tho, vd 'HORAAB12CD34') trong doan text tho; tra ve ma tim thay
// hoac null. So sanh tren dang da chuan hoa ca 2 phia.
export function findPaymentCodeInText(text, codes) {
  const haystack = normalizePaymentText(text);
  if (!haystack) return null;
  for (const code of codes || []) {
    const needle = normalizePaymentText(code);
    if (needle && haystack.includes(needle)) return code;
  }
  return null;
}

// Huong dan thanh toan tra cho client khi tao don SePay thanh cong.
// qr_url theo chuan anh VietQR (img.vietqr.io) — chi la anh tien ich,
// kem huong dan chu de trang van dung duoc khi dich vu anh loi.
export function buildSepayInstructions(env, { code, amount }) {
  const amt = Math.round(Number(amount));
  const qrUrl =
    `https://img.vietqr.io/image/${encodeURIComponent(env.SEPAY_BANK_BIN)}-${encodeURIComponent(env.SEPAY_ACCOUNT_NUMBER)}-compact2.png` +
    `?amount=${amt}&addInfo=${encodeURIComponent(code)}&accountName=${encodeURIComponent(env.SEPAY_ACCOUNT_NAME)}`;
  return {
    bank: env.SEPAY_BANK_NAME,
    account_number: env.SEPAY_ACCOUNT_NUMBER,
    account_name: env.SEPAY_ACCOUNT_NAME,
    amount: amt,
    content: code,
    qr_url: qrUrl,
  };
}

// ---------- Dispatcher dung cho POST /api/orders ----------
export async function createGatewayPayment(env, gateway, { order, origin, ipAddr }) {
  if (gateway === "momo") {
    return createMomoPayment(env, {
      orderId: order.id,
      requestId: order.id,
      amount: order.amount_vnd,
      orderInfo: `HORA Media ${order.plan} ${order.period} - ${order.id}`,
      redirectUrl: `${origin}/api/payments/return`,
      ipnUrl: `${origin}/api/payments/momo-ipn`,
    });
  }
  if (gateway === "vnpay") {
    // vnp_TxnRef chi nen chua ky tu chu/so — bo dau '-' cua order id khi gui di,
    // gia tri nay duoc luu o payments.gateway_order_id de IPN doi chieu.
    const txnRef = order.id.replace(/[^A-Za-z0-9]/g, "");
    return buildVnpayUrl(env, {
      txnRef,
      amount: order.amount_vnd,
      orderInfo: `HORA Media ${order.plan} ${order.period} - ${order.id}`,
      returnUrl: `${origin}/api/payments/return`,
      ipAddr,
    });
  }
  throw Object.assign(new Error("Cổng thanh toán không hỗ trợ."), { code: "GATEWAY_UNSUPPORTED" });
}
