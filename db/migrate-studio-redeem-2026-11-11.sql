-- Studio: bang ma token nap tien (redeem).
-- Luong: khach nap tien qua kenh cua chu shop (chuyen khoan QR...) ->
-- he thong thanh toan PHIA SERVER CUA CHU SHOP ghi 1 dong token vao bang nay
-- (token + so credit tuong ung) -> khach dan token vao Studio ->
-- POST /api/studio/redeem doi soat va cong credit (moi token dung 1 lan).
CREATE TABLE IF NOT EXISTS studio_redeem_tokens (
  token TEXT PRIMARY KEY,
  credits INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  used_by TEXT,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_studio_tokens_usedby ON studio_redeem_tokens(used_by);
