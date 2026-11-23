#!/usr/bin/env bash
# 全部闸门。任何一个红就退出非零。
set -e
cd "$(dirname "$0")"
echo "▸ TypeScript"   && npx tsc --noEmit
echo "▸ i18n 文字检查" && node etl/i18n_check_literals.mjs
echo "▸ i18n 产物与提交一致" && {
  snap() { cat locale/lang.pot locale/*/LC_MESSAGES/lang.po src/i18n/locales/*.json | shasum; }
  before=$(snap)
  pnpm -s i18n >/dev/null
  [[ "$before" == "$(snap)" ]] || { echo "pot/po/json 和源码里的 _t() 不一致：已重新生成，请检查并提交 locale/ 与 src/i18n/locales/" >&2; exit 1; }
  # CI 里还要和 git 里提交的版本比对
  if [[ -n "${CI:-}" ]]; then git diff --exit-code -- locale src/i18n/locales; fi
}
echo "▸ i18n 脚本测试" && node --test etl/i18n.test.mjs
echo "▸ 单元测试"      && npx vitest run
if [[ ! -f build/eve.db || ! -f build/game-db.json || ! -f build/names.json || ! -f build/pyodide.json ]]; then
  echo "▸ 生成游戏数据" && pnpm etl
fi
echo "▸ 打包 Python 引擎" && node etl/40_bundle_py.mjs
echo "▸ 数据资产测试" && uv run --python 3.13 --with pytest pytest -q etl/test_etl.py
echo "▸ 本地 Pyodide 资产" && node --test etl/pyodide.test.mjs
echo "▸ 数值对拍" && node etl/parity/run_parity.mjs
echo "▸ 生产构建"      && npx vite build >/dev/null
echo "▸ 无外域请求的 Chromium Worker" && node etl/parity/browser_local.mjs
echo "▸ SW 盖印"        && node etl/99_stamp_sw.mjs
echo "▸ 端到端冒烟测试" && node etl/98_smoke.mjs
echo "▸ SW 测试"        && node --test etl/sw.test.mjs
echo "▸ 生产包不含开发页面" && { ! grep -rlE "dev/gallery|dev/tokens|mockEngine only imports" dist; }
echo
echo "全部闸门通过 ✅"
