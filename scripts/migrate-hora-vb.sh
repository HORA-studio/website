#!/usr/bin/env bash
# HORA — migrate du lieu app Video Builder: D1 hora-vb -> D1 hora-website.
# Chay SAU khi da apply website/db/schema.sql len hora-website (ca local + remote).
#
# Yeu cau: CLOUDFLARE_API_TOKEN (quyen D1 Edit) + CLOUDFLARE_ACCOUNT_ID trong env,
# hoac dat san trong ~/.hora_cloudflare_token.
#
# Dung:
#   ./scripts/migrate-hora-vb.sh --remote     # migrate production
#   ./scripts/migrate-hora-vb.sh --local      # migrate D1 local (test)
set -euo pipefail

MODE="${1:---remote}"
[ "$MODE" = "--remote" ] || [ "$MODE" = "--local" ] || { echo "Usage: $0 [--remote|--local]"; exit 1; }

# Voi --local, ca 2 DB (hora-vb, hora-website) phai co binding trong wrangler.toml
# dang dung → chay tu thu muc hora-worker (co ca 3 DB) va tro schema web.
WRANGLER_CWD="${WRANGLER_CWD:-.}"
run_here() { (cd "$WRANGLER_CWD" && npx -y wrangler@4 "$@"); }

: "${CLOUDFLARE_ACCOUNT_ID:?can CLOUDFLARE_ACCOUNT_ID}"
: "${CLOUDFLARE_API_TOKEN:?can CLOUDFLARE_API_TOKEN (dat trong env hoac ~/.hora_cloudflare_token)}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

dump() { run_here d1 execute "$1" "$MODE" --json --command "$2" 2>/dev/null; }
run()  { run_here d1 execute hora-website "$MODE" --file "$1" 2>&1; }

echo "== 1/5 Dump plans tu hora-vb =="
PLANS_SQL="$WORK/plans.sql"
dump hora-vb "SELECT 'INSERT OR IGNORE INTO plans (app,tier,name,quota_json) VALUES (' ||
  quote(app) || ',' || quote(tier) || ',' || quote(name) || ',' || quote(quota_json) || ');' AS s FROM plans" \
  | python3 -c 'import sys,json;[print(r["s"]) for r in json.load(sys.stdin)[0]["results"]]' > "$PLANS_SQL"
wc -l < "$PLANS_SQL" | xargs echo "  plans rows:"

echo "== 2/5 Dump licenses tu hora-vb =="
LIC_SQL="$WORK/licenses.sql"
dump hora-vb "SELECT 'INSERT OR IGNORE INTO licenses (id,license_key,customer_id,app,product_id,tier,status,organization,expiry_utc,validity_days,activated_at,revoked_at,source,order_id,issued_by,customer_email,customer_name,notes,device_count,created_at) VALUES (' ||
  quote(license_id) || ',' || quote(license_key) || ',NULL,' || quote('video-builder') || ',' || quote(product_id) || ',' ||
  quote(tier) || ',' || quote(status) || ',' || quote(COALESCE(organization,'admin')) || ',' ||
  COALESCE(quote(expiry_utc),'NULL') || ',' || COALESCE(validity_days,0) || ',' ||
  COALESCE(quote(activated_at),'NULL') || ',' || COALESCE(quote(revoked_at),'NULL') || ',' || quote('manual') || ',NULL,' ||
  COALESCE(quote(issued_by),'NULL') || ',' || COALESCE(quote(customer_email),'NULL') || ',' ||
  COALESCE(quote(customer_name),'NULL') || ',' || COALESCE(quote(notes),'NULL') || ',' ||
  COALESCE(device_count,0) || ',' || quote(created_at) || ');' AS s FROM licenses" \
  | python3 -c 'import sys,json;[print(r["s"]) for r in json.load(sys.stdin)[0]["results"]]' > "$LIC_SQL"
wc -l < "$LIC_SQL" | xargs echo "  license rows:"

echo "== 3/5 Dump app_device_bindings =="
# Chi lay binding co license TON TAI (tranh FK/hang mo coi khi DB cu co binding
# tro license da bi xoa).
BIND_SQL="$WORK/bindings.sql"
dump hora-vb "SELECT 'INSERT OR IGNORE INTO app_device_bindings (app,device_id,license_id,bound_at) VALUES (' ||
  quote(app) || ',' || quote(device_id) || ',' || quote(license_id) || ',' || quote(bound_at) || ');' AS s
  FROM app_device_bindings WHERE license_id IN (SELECT license_id FROM licenses)" \
  | python3 -c 'import sys,json;[print(r["s"]) for r in json.load(sys.stdin)[0]["results"]]' > "$BIND_SQL"
wc -l < "$BIND_SQL" | xargs echo "  binding rows:"

echo "== 4/5 Dump app_device_lastchange + devices =="
DEV_SQL="$WORK/devices.sql"
{
  dump hora-vb "SELECT 'INSERT OR IGNORE INTO app_device_lastchange (app,license_id,changed_at) VALUES (' ||
    quote(app) || ',' || quote(license_id) || ',' || quote(changed_at) || ');' AS s FROM app_device_lastchange" \
    | python3 -c 'import sys,json;[print(r["s"]) for r in json.load(sys.stdin)[0]["results"]]'
  dump hora-vb "SELECT 'INSERT OR IGNORE INTO devices (app,device_id,license_id,customer_id,bound_at,device_components) VALUES (' ||
    quote('video-builder') || ',' || quote('lic:' || license_id) || ',' || quote(license_id) || ',NULL,' ||
    quote(bound_at) || ',' || COALESCE(quote(device_components),'NULL') || ');' AS s
    FROM devices WHERE license_id IN (SELECT license_id FROM licenses)" \
    | python3 -c 'import sys,json;[print(r["s"]) for r in json.load(sys.stdin)[0]["results"]]'
} > "$DEV_SQL"
wc -l < "$DEV_SQL" | xargs echo "  device rows:"

echo "== 5/5 Import vao hora-website ($MODE) =="
for f in "$PLANS_SQL" "$LIC_SQL" "$BIND_SQL" "$DEV_SQL"; do
  [ -s "$f" ] || { echo "  (bo qua $f — rong)"; continue; }
  run "$f"
done

echo "== Ket qua =="
dump hora-website "SELECT 'licenses' t, COUNT(*) n FROM licenses UNION ALL SELECT 'plans', COUNT(*) FROM plans UNION ALL SELECT 'bindings', COUNT(*) FROM app_device_bindings" \
  | python3 -c 'import sys,json;[print(" ",r["t"],"=",r["n"]) for r in json.load(sys.stdin)[0]["results"]]'
echo "Done."
