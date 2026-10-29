-- HORA — migrate du lieu app Video Builder tu D1 `hora-vb` sang `hora-website`.
-- Chay SAU khi da apply db/schema.sql (co bang licenses/devices/app_device_bindings/...).
--
-- VI SAO: worker VB + admin (hora-worker-core) gio bind DB_VB -> hora-website.
-- Du lieu cu (license do admin cap tay) phai co mat o DB moi truoc khi doi binding,
-- neu khong khach cu mat quyen va admin khong thay license.
--
-- CACH CHAY: xuat du lieu tu hora-vb thanh INSERT roi chay vao hora-website.
--   Xem scripts/migrate-hora-vb.sh (dump -> transform -> import).
-- Cac lenh duoi day la mau transform cho tung bang.

-- ---------------------------------------------------------------------------
-- 1) licenses: license_id -> id; them app/source; customer_id = NULL (admin cap tay,
--    chua gan khach nao). Giu nguyen license_key/tier/status/validity_days.
-- ---------------------------------------------------------------------------
-- INSERT INTO licenses (id, license_key, customer_id, app, product_id, tier, status,
--   organization, expiry_utc, validity_days, activated_at, revoked_at, source,
--   order_id, issued_by, customer_email, customer_name, notes, device_count, created_at)
-- SELECT license_id, license_key, NULL, 'video-builder', product_id, tier, status,
--   COALESCE(organization, 'admin'), expiry_utc, COALESCE(validity_days, 0),
--   activated_at, revoked_at, 'manual', NULL,
--   issued_by, customer_email, customer_name, notes, COALESCE(device_count, 0), created_at
-- FROM licenses_old;

-- ---------------------------------------------------------------------------
-- 2) app_device_bindings: copy nguyen (cung ten cot).
-- ---------------------------------------------------------------------------
-- INSERT INTO app_device_bindings (app, device_id, license_id, bound_at)
-- SELECT app, device_id, license_id, bound_at FROM app_device_bindings_old;

-- ---------------------------------------------------------------------------
-- 3) app_device_lastchange: copy nguyen.
-- ---------------------------------------------------------------------------
-- INSERT INTO app_device_lastchange (app, license_id, changed_at)
-- SELECT app, license_id, changed_at FROM app_device_lastchange_old;

-- ---------------------------------------------------------------------------
-- 4) devices (device_components cho unbind flow): PK moi la (app, device_id).
--    He cu 1 license = 1 device -> dat device_id = 'lic:<license_id>'.
-- ---------------------------------------------------------------------------
-- INSERT INTO devices (app, device_id, license_id, customer_id, bound_at, device_components)
-- SELECT 'video-builder', 'lic:' || license_id, license_id, NULL, bound_at, device_components
-- FROM devices_old;

-- ---------------------------------------------------------------------------
-- 5) license_devices, plans, unbind_requests, app_feedback: copy nguyen (cung schema).
-- ---------------------------------------------------------------------------
-- INSERT INTO plans (app, tier, name, quota_json) SELECT app, tier, name, quota_json FROM plans_old;
