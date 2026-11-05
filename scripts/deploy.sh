#!/usr/bin/env bash
# HORA — deploy website len Cloudflare Pages (project hora-website, domain hora.works).
#
# QUAN TRONG: KHONG duoc chay `wrangler pages deploy .` truc tiep tu root repo.
# Direct upload day TOAN BO thu muc lam static va KHONG doc .assetsignore, nen cac
# file noi bo (wrangler.toml, db/, docs/, scripts/, README.md, LICENSE, web-remote-demo/)
# se bi public. Script nay build mot thu muc staging sach chi gom file can cho web
# roi moi deploy.
#
# Yeu cau: da dang nhap wrangler (npx wrangler login) hoac CLOUDFLARE_API_TOKEN trong env.
#
# Dung:
#   ./scripts/deploy.sh            # deploy production (branch main)
#   ./scripts/deploy.sh --preview  # deploy preview (branch khac), khong dung prod
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="hora-website"
BRANCH="main"

if [ "${1:-}" = "--preview" ]; then
  BRANCH="preview-$(date +%Y%m%d-%H%M%S)"
fi

# Chi nhung thu muc/file nay duoc public. Them file moi vao website thi phai them o day.
PUBLIC_FILES=(404.html account.html index.html favicon.ico _headers robots.txt sitemap.xml)
PUBLIC_DIRS=(assets css js functions)

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "== 1/2 Build staging sach =="
cd "$ROOT"
for d in "${PUBLIC_DIRS[@]}"; do
  [ -e "$d" ] || { echo "  thieu thu muc $d"; exit 1; }
  cp -r "$d" "$STAGE"/
done
for f in "${PUBLIC_FILES[@]}"; do
  [ -e "$f" ] || { echo "  thieu file $f"; exit 1; }
  cp "$f" "$STAGE"/
done
echo "  $(find "$STAGE" -type f | wc -l) file -> deploy"

echo "== 2/2 Deploy len Pages (project=$PROJECT, branch=$BRANCH) =="
cd "$STAGE"
npx -y wrangler@4 pages deploy . --project-name="$PROJECT" --branch="$BRANCH" --commit-dirty=true

echo "Done. https://hora.works"
