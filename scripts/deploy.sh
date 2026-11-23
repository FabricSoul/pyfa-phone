#!/usr/bin/env bash
# 部署到 Cloudflare Pages。必须先跑 ETL：只重建前端会让新 JS 调用旧的 Python 包（2026-11-23 线上事故）。
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm etl
npx vite build
node etl/99_stamp_sw.mjs
ROOT="$PWD"
# 在仓库外运行 wrangler，避免它被加进依赖。
(cd /tmp && npx -y wrangler@4 pages deploy "$ROOT/dist" --project-name pyfa --branch main --commit-dirty=true --force)
