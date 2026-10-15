#!/usr/bin/env bash
set -euo pipefail
BASE="$(readlink -f /var/www/boomer-erp/current)"
CANDIDATE="${CANDIDATE:-/var/www/boomer-erp/releases/go-mini-leaderboard-20261016}"
INPUT=/tmp/go-mini-leaderboard-20261016
if [[ -e "$CANDIDATE" ]]; then echo 'Candidate already exists; inspect before retry.' >&2; exit 1; fi
mkdir -p "$CANDIDATE"
rsync -a --exclude=node_modules --exclude=.output --exclude=dist --exclude=.git --exclude=build-tencent.log "$BASE/" "$CANDIDATE/"
ln -s "$BASE/node_modules" "$CANDIDATE/node_modules"
cp "$INPUT/src/lib/go-bridge/leaderboard.ts" "$CANDIDATE/src/lib/go-bridge/leaderboard.ts"
cp "$INPUT/src/lib/go-bridge/leaderboard.test.ts" "$CANDIDATE/src/lib/go-bridge/leaderboard.test.ts"
cp "$INPUT/src/routes/api/public/go/leaderboard.ts" "$CANDIDATE/src/routes/api/public/go/leaderboard.ts"
printf '%s\n' "$BASE" > "$CANDIDATE/GO_MINI_PREVIOUS_RELEASE"
cd "$CANDIDATE"
npx --yes tsx --test src/lib/go-bridge/*.test.ts > go-mini-tests.log 2>&1
NODE_OPTIONS=--max-old-space-size=4096 npm run build:tencent > go-mini-build.log 2>&1
ERP_PORT=3906 ERP_BIND_HOST=127.0.0.1 APP_DIR="$CANDIDATE" NODE_ENV=production pm2 start "$CANDIDATE/scripts/run-tencent-erp.sh" --interpreter /bin/bash --name go-mini-leaderboard-candidate
for i in {1..40}; do
  if curl -fsS http://127.0.0.1:3906/login >/dev/null; then break; fi
  sleep 1
done
STATUS="$(curl -sS -o /tmp/go-mini-leaderboard-reject.json -w '%{http_code}' http://127.0.0.1:3906/api/public/go/leaderboard)"
[[ "$STATUS" == 401 ]]
node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync("/tmp/go-mini-leaderboard-reject.json","utf8"));if(x.ok!==false)process.exit(1);console.log("Candidate anonymous request denied; no employee data.")'
echo "Candidate ready: $CANDIDATE; baseline unchanged: $(readlink -f /var/www/boomer-erp/current)"
tail -n 8 go-mini-tests.log
