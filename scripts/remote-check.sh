#!/usr/bin/env bash
# 在远端机器（默认 zion）上跑完整闸门，本机只负责同步代码、取回结果。
# 用法：scripts/remote-check.sh [host]   退出码等于远端 check-all 的退出码。
set -euo pipefail
HOST="${1:-${REMOTE_CHECK_HOST:-zion}}"
DIR="${REMOTE_CHECK_DIR:-pyfa-phone-ci}"
cd "$(dirname "$0")/.."
rsync -az --delete \
  --exclude node_modules --exclude dist --exclude build --exclude .wrangler \
  --exclude 'public/data' --exclude 'public/pyodide' --exclude 'public/img' \
  --exclude '.ryugi/sdd' ./ "$HOST:~/$DIR/"
# NixOS 上 Playwright 自带的 Chromium 缺系统库，改用 nixpkgs 的 chromium（脚本已支持 PLAYWRIGHT_CHROMIUM_EXECUTABLE）。
ssh "$HOST" "if command -v nix >/dev/null; then export PLAYWRIGHT_CHROMIUM_EXECUTABLE=\$(nix shell nixpkgs#chromium -c sh -c 'readlink -f \$(which chromium)'); fi; cd ~/$DIR && pnpm install --frozen-lockfile >/tmp/$DIR-install.log 2>&1 && pnpm etl >/tmp/$DIR-etl.log 2>&1 && ./check-all.sh"
